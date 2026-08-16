import { randomUUID } from "node:crypto"
import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "../db"
import { policyAttachments } from "../db/schema"
import { putObject } from "../storage/r2"
import type { AttachmentSourceType } from "../types"

export interface PolicyAttachmentWithUploader {
  id: number
  policyId: number
  fileName: string
  description: string | null
  mimeType: string
  sizeBytes: number
  isVoided: boolean
  sourceType: AttachmentSourceType
  sourceId: number | null
  createdAt: Date
  uploadedBy: { id: number; name: string | null; email: string }
}

// storageKey is deliberately absent - see listPolicyAttachmentsByPolicyId.
const publicColumns = {
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
// confirmed against another, and generated documents reuse it.
export function attachmentKeyPrefix(policyId: number): string {
  return `policy-attachments/${policyId}/`
}

// Metadata only - storageKey is explicitly excluded from the selected columns
// so it can never leak into this response. Downloads go through
// findPolicyAttachmentById + a fresh presigned URL, minted on demand.
//
// Voided documents are withheld by default: staff shouldn't see a receipt for
// a payment that was reversed. Admins pass includeVoided to get the full
// audit trail back.
export async function listPolicyAttachmentsByPolicyId(
  policyId: number,
  options?: { includeVoided?: boolean }
): Promise<PolicyAttachmentWithUploader[]> {
  const rows = await db.query.policyAttachments.findMany({
    where: options?.includeVoided
      ? eq(policyAttachments.policyId, policyId)
      : and(eq(policyAttachments.policyId, policyId), eq(policyAttachments.isVoided, false)),
    orderBy: desc(policyAttachments.createdAt),
    columns: publicColumns,
    with: { createdByUser: { columns: { id: true, name: true, email: true } } },
  })
  return rows.map(({ createdByUser, ...rest }) => ({ ...rest, uploadedBy: createdByUser }))
}

export function findPolicyAttachmentById(id: number) {
  return db.query.policyAttachments.findFirst({ where: eq(policyAttachments.id, id) })
}

// Start-of-day in the server's local time zone; good enough for a soft
// anti-abuse guardrail, not a billing-grade quota.
function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function countAttachmentsCreatedTodayByUser(userId: number): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(policyAttachments)
    .where(
      and(eq(policyAttachments.createdBy, userId), gte(policyAttachments.createdAt, startOfToday()))
    )
  return Number(count)
}

export async function createPolicyAttachment(input: {
  policyId: number
  fileName: string
  description?: string | null
  storageKey: string
  mimeType: string
  sizeBytes: number
  sourceType?: AttachmentSourceType
  sourceId?: number | null
  createdBy: number
}): Promise<PolicyAttachmentWithUploader> {
  const [row] = await db
    .insert(policyAttachments)
    .values(input)
    .returning({ id: policyAttachments.id })
  const created = await db.query.policyAttachments.findFirst({
    where: eq(policyAttachments.id, row.id),
    columns: publicColumns,
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
export async function storeGeneratedPolicyAttachment(input: {
  policyId: number
  pdf: Buffer
  // Display name, extension included - it becomes the download filename.
  fileName: string
  // Slug for the R2 key, e.g. "receipt". Never user-supplied.
  keySlug: string
  description: string | null
  sourceType: AttachmentSourceType
  sourceId: number
  createdBy: number
}): Promise<PolicyAttachmentWithUploader> {
  const storageKey = `${attachmentKeyPrefix(input.policyId)}${randomUUID()}-${input.keySlug}.pdf`
  await putObject(storageKey, input.pdf, "application/pdf")
  return createPolicyAttachment({
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
}

// Flips the generated document(s) for a voided invoice or receipt. The R2
// object and the row are both kept - this only controls who can still see it.
export async function markAttachmentsVoidedBySource(
  sourceType: AttachmentSourceType,
  sourceId: number
): Promise<void> {
  await db
    .update(policyAttachments)
    .set({ isVoided: true })
    .where(
      and(eq(policyAttachments.sourceType, sourceType), eq(policyAttachments.sourceId, sourceId))
    )
}
