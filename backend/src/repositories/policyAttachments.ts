import { randomUUID } from "node:crypto"
import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "../db"
import { policyLogs, policyAttachments, policyLogAttachments } from "../db/schema"
import { putObject } from "../storage/r2"
import type { AttachmentSourceType } from "../types"

export interface PolicyAttachmentWithUploader {
  id: string
  policyId: string
  fileName: string
  description: string | null
  mimeType: string
  sizeBytes: number
  isVoided: boolean
  sourceType: AttachmentSourceType
  sourceId: string | null
  createdAt: Date
  uploadedBy: { id: string; name: string | null; email: string }
}

// storageKey is deliberately absent - see listPolicyAttachmentsByPolicyId.
// Exported so policyLogAttachments.ts selects the same safe column set when it
// embeds an attachment in a link row.
export const attachmentPublicColumns = {
  id: true,
  policyId: true,
  fileName: true,
  description: true,
  mimeType: true,
  sizeBytes: true,
  isVoided: true,
  sourceType: true,
  sourceId: true,
  createdAt: true,
} as const

// Every R2 object for a policy lives under this prefix. Presign generates keys
// with it, confirm re-checks it so an upload presigned for one policy can't be
// confirmed against another, and generated documents reuse it. Scoped by org
// too, so a confirm for another org's presigned key is impossible.
export function attachmentKeyPrefix(orgId: string, policyId: string): string {
  return `org/${orgId}/policies/${policyId}/`
}

// Metadata only - storageKey is explicitly excluded from the selected columns
// so it can never leak into this response. Downloads go through
// findPolicyAttachmentById + a fresh presigned URL, minted on demand.
//
// Voided documents are withheld by default: staff shouldn't see a receipt for
// a payment that was reversed. Admins pass includeVoided to get the full
// audit trail back.
export async function listPolicyAttachmentsByPolicyId(
  orgId: string,
  policyId: string,
  options?: { includeVoided?: boolean }
): Promise<PolicyAttachmentWithUploader[]> {
  const rows = await db.query.policyAttachments.findMany({
    where: options?.includeVoided
      ? and(eq(policyAttachments.policyId, policyId), eq(policyAttachments.orgId, orgId))
      : and(
          eq(policyAttachments.policyId, policyId),
          eq(policyAttachments.orgId, orgId),
          eq(policyAttachments.isVoided, false)
        ),
    orderBy: desc(policyAttachments.createdAt),
    columns: attachmentPublicColumns,
    with: { createdByUser: { columns: { id: true, name: true, email: true } } },
  })
  return rows.map(({ createdByUser, ...rest }) => ({ ...rest, uploadedBy: createdByUser }))
}

export function findPolicyAttachmentById(orgId: string, id: string) {
  return db.query.policyAttachments.findFirst({
    where: and(eq(policyAttachments.id, id), eq(policyAttachments.orgId, orgId)),
  })
}

// Start-of-day in the server's local time zone; good enough for a soft
// anti-abuse guardrail, not a billing-grade quota.
function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function countAttachmentsCreatedTodayByUser(
  orgId: string,
  userId: string
): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(policyAttachments)
    .where(
      and(
        eq(policyAttachments.orgId, orgId),
        eq(policyAttachments.createdBy, userId),
        gte(policyAttachments.createdAt, startOfToday())
      )
    )
  return Number(count)
}

export async function createPolicyAttachment(
  orgId: string,
  input: {
    policyId: string
    fileName: string
    description?: string | null
    storageKey: string
    mimeType: string
    sizeBytes: number
    sourceType?: AttachmentSourceType
    sourceId?: string | null
    createdBy: string
  }
): Promise<PolicyAttachmentWithUploader> {
  const [row] = await db
    .insert(policyAttachments)
    .values({ ...input, orgId })
    .returning({ id: policyAttachments.id })
  const created = await db.query.policyAttachments.findFirst({
    where: eq(policyAttachments.id, row.id),
    columns: attachmentPublicColumns,
    with: { createdByUser: { columns: { id: true, name: true, email: true } } },
  })
  if (!created) throw new Error(`Failed to reload policy attachment ${row.id} after insert`)
  const { createdByUser, ...rest } = created
  return { ...rest, uploadedBy: createdByUser }
}

// Uploads a server-generated PDF and files it as a policy attachment in one
// step. Callers hold only the bytes; key layout, mime type, and size all live
// here. Unlike the staff upload path there is no presign/confirm round trip
// and no size cap or daily quota - these documents are produced by the server
// itself.
export async function storeGeneratedPolicyAttachment(
  orgId: string,
  input: {
    policyId: string
    pdf: Buffer
    // Display name, extension included - it becomes the download filename.
    fileName: string
    // Slug for the R2 key, e.g. "receipt". Never user-supplied.
    keySlug: string
    description: string | null
    sourceType: AttachmentSourceType
    sourceId: string
    createdBy: string
    // The log this document belongs to, when the same action wrote one, so the
    // document shows up under that log without anyone linking it by hand.
    linkToLogId?: string
  }
): Promise<PolicyAttachmentWithUploader> {
  const storageKey = `${attachmentKeyPrefix(orgId, input.policyId)}${randomUUID()}-${input.keySlug}.pdf`
  await putObject(storageKey, input.pdf, "application/pdf")
  const attachment = await createPolicyAttachment(orgId, {
    policyId: input.policyId,
    fileName: input.fileName,
    description: input.description,
    storageKey,
    mimeType: "application/pdf",
    sizeBytes: input.pdf.length,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    createdBy: input.createdBy,
  })

  // Deliberately last and deliberately swallowed: the document itself is the
  // record that matters, and an unlinked one can still be linked by hand.
  if (input.linkToLogId !== undefined) {
    try {
      // Inserted directly rather than through policyLogAttachments.ts, which
      // imports this module for its column set - going the other way too would
      // make the pair circular for one three-line insert. The log lookup keeps
      // the link inside the same org as the attachment.
      const [log] = await db
        .select({ id: policyLogs.id })
        .from(policyLogs)
        .where(and(eq(policyLogs.id, input.linkToLogId), eq(policyLogs.orgId, orgId)))
      if (log) {
        await db
          .insert(policyLogAttachments)
          .values({
            orgId,
            logId: log.id,
            attachmentId: attachment.id,
            linkedBy: input.createdBy,
          })
          .onConflictDoNothing()
      }
    } catch {
      // Callers here have already committed; see the header of
      // routes/accountingDocuments.ts.
    }
  }

  return attachment
}

// Flips the generated document(s) for a voided invoice or receipt. The R2
// object and the row are both kept - this only controls who can still see it.
export async function markAttachmentsVoidedBySource(
  orgId: string,
  sourceType: AttachmentSourceType,
  sourceId: string
): Promise<void> {
  await db
    .update(policyAttachments)
    .set({ isVoided: true })
    .where(
      and(
        eq(policyAttachments.orgId, orgId),
        eq(policyAttachments.sourceType, sourceType),
        eq(policyAttachments.sourceId, sourceId)
      )
    )
}
