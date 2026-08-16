// The join between a policy's logs and its attachments. Reads are batched per
// policy rather than per log: a policy has a few dozen logs and the client
// renders a badge on every row, so one call feeds both the list and whichever
// log the user opens.
//
// Voided documents follow the same rule as the attachments list - withheld
// from staff, visible to admins - so a receipt for a reversed payment drops
// out of its log rather than lingering there.

import { desc, eq, inArray } from "drizzle-orm"
import { db } from "../db"
import { policyAttachments, policyLogAttachments, policyLogs, users } from "../db/schema"
import { attachmentPublicColumns, type PolicyAttachmentWithUploader } from "./policyAttachments"

export interface PolicyLogAttachmentLink {
  id: number
  logId: number
  createdAt: Date
  linkedBy: { id: number; name: string | null; email: string }
  attachment: PolicyAttachmentWithUploader
}

const userColumns = { id: true, name: true, email: true } as const

export async function listPolicyLogAttachmentsByPolicyId(
  policyId: number,
  options?: { includeVoided?: boolean }
): Promise<PolicyLogAttachmentLink[]> {
  const rows = await db
    .select({
      id: policyLogAttachments.id,
      logId: policyLogAttachments.logId,
      createdAt: policyLogAttachments.createdAt,
      attachmentId: policyLogAttachments.attachmentId,
      linkedById: policyLogAttachments.linkedBy,
    })
    .from(policyLogAttachments)
    // Links are addressed by log, so the policy scope comes from the log side.
    .innerJoin(policyLogs, eq(policyLogAttachments.logId, policyLogs.id))
    .where(eq(policyLogs.policyId, policyId))
    .orderBy(desc(policyLogAttachments.createdAt))

  if (rows.length === 0) return []

  // Two follow-up reads keyed by the ids above, rather than widening the join:
  // both reuse the same column sets the attachments list already vets, so
  // storageKey can't leak and the uploader shape stays identical.
  const [attachments, linkers] = await Promise.all([
    db.query.policyAttachments.findMany({
      where: inArray(
        policyAttachments.id,
        rows.map((r) => r.attachmentId)
      ),
      columns: attachmentPublicColumns,
      with: { createdByUser: { columns: userColumns } },
    }),
    db.query.users.findMany({
      where: inArray(
        users.id,
        rows.map((r) => r.linkedById)
      ),
      columns: userColumns,
    }),
  ])

  const attachmentById = new Map(
    attachments.map(({ createdByUser, ...rest }) => [
      rest.id,
      { ...rest, uploadedBy: createdByUser },
    ])
  )
  const userById = new Map(linkers.map((u) => [u.id, u]))

  return rows.flatMap((row) => {
    const attachment = attachmentById.get(row.attachmentId)
    const linkedBy = userById.get(row.linkedById)
    if (!attachment || !linkedBy) return []
    // Staff never see a voided document, here or in the attachments list.
    if (attachment.isVoided && !options?.includeVoided) return []
    return [{ id: row.id, logId: row.logId, createdAt: row.createdAt, linkedBy, attachment }]
  })
}

export type LinkAttachmentsResult =
  | { status: "ok"; links: PolicyLogAttachmentLink[] }
  | { status: "log_not_found" }
  | { status: "attachment_not_found" }
  | { status: "cross_policy" }

// Links one or more attachments to a single log. Both ends must sit on the
// same policy - the client only ever offers logs from the policy it is looking
// at, so a mismatch means a hand-rolled request. Re-linking is a no-op rather
// than an error, so a double submit can't 409.
export async function linkAttachmentsToLog(input: {
  logId: number
  attachmentIds: number[]
  linkedBy: number
}): Promise<LinkAttachmentsResult> {
  const log = await db.query.policyLogs.findFirst({
    where: eq(policyLogs.id, input.logId),
    columns: { id: true, policyId: true },
  })
  if (!log) return { status: "log_not_found" }

  const attachments = await db.query.policyAttachments.findMany({
    where: inArray(policyAttachments.id, input.attachmentIds),
    columns: { id: true, policyId: true },
  })
  if (attachments.length !== new Set(input.attachmentIds).size) {
    return { status: "attachment_not_found" }
  }
  if (attachments.some((a) => a.policyId !== log.policyId)) return { status: "cross_policy" }

  await db
    .insert(policyLogAttachments)
    .values(
      attachments.map((a) => ({
        logId: input.logId,
        attachmentId: a.id,
        linkedBy: input.linkedBy,
      }))
    )
    .onConflictDoNothing()

  // Reloaded through the list so the response carries the same embedded shape
  // the client already renders, including any link that already existed.
  const all = await listPolicyLogAttachmentsByPolicyId(log.policyId, { includeVoided: true })
  const requested = new Set(input.attachmentIds)
  return {
    status: "ok",
    links: all.filter((l) => l.logId === input.logId && requested.has(l.attachment.id)),
  }
}

// Linking is an editorial call, so undoing one is too - unlike the logs and
// attachments themselves, which are append-only. Anyone may unlink, including
// a link someone else made.
export async function unlinkPolicyLogAttachment(id: number): Promise<boolean> {
  const deleted = await db
    .delete(policyLogAttachments)
    .where(eq(policyLogAttachments.id, id))
    .returning({ id: policyLogAttachments.id })
  return deleted.length > 0
}
