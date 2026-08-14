import { and, desc, eq, gte, sql } from "drizzle-orm"
import { db } from "../db"
import { policyAttachments } from "../db/schema"

export interface PolicyAttachmentWithUploader {
  id: number
  policyId: number
  fileName: string
  description: string | null
  mimeType: string
  sizeBytes: number
  createdAt: Date
  uploadedBy: { id: number; name: string | null; email: string }
}

// Metadata only - storageKey is explicitly excluded from the selected columns
// so it can never leak into this response. Downloads go through
// findPolicyAttachmentById + a fresh presigned URL, minted on demand.
export async function listPolicyAttachmentsByPolicyId(
  policyId: number
): Promise<PolicyAttachmentWithUploader[]> {
  const rows = await db.query.policyAttachments.findMany({
    where: eq(policyAttachments.policyId, policyId),
    orderBy: desc(policyAttachments.createdAt),
    columns: {
      id: true,
      policyId: true,
      fileName: true,
      description: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
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
  createdBy: number
}): Promise<PolicyAttachmentWithUploader> {
  const [row] = await db
    .insert(policyAttachments)
    .values(input)
    .returning({ id: policyAttachments.id })
  const created = await db.query.policyAttachments.findFirst({
    where: eq(policyAttachments.id, row.id),
    columns: {
      id: true,
      policyId: true,
      fileName: true,
      description: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
    with: { createdByUser: { columns: { id: true, name: true, email: true } } },
  })
  if (!created) throw new Error(`Failed to reload policy attachment ${row.id} after insert`)
  const { createdByUser, ...rest } = created
  return { ...rest, uploadedBy: createdByUser }
}
