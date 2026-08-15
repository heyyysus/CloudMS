import { randomUUID } from "node:crypto"
import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import {
  countAttachmentsCreatedTodayByUser,
  createPolicyAttachment,
  findAutoPolicyById,
  findPolicyAttachmentById,
  listPolicyAttachmentsByPolicyId,
} from "../repositories"
import {
  deleteObject,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  headObject,
  R2NotConfiguredError,
} from "../storage/r2"
import { firstIssue, parseId } from "./helpers"
import {
  attachmentLinkQuery,
  confirmAttachmentBody,
  idParam,
  presignAttachmentBody,
} from "./schemas"

export const policyAttachmentsRouter = Router()

// R2NotConfiguredError maps to 503 (mirrors MailNotConfiguredError in
// mail.ts); returns false (and lets the caller's catch rethrow) for anything
// else, since app.ts's generic error handler should see those.
function isR2NotConfigured(err: unknown, res: Response): boolean {
  if (err instanceof R2NotConfiguredError) {
    res.status(503).json({ error: "File storage is not configured" })
    return true
  }
  return false
}

// Read inline per call (not cached at module load), matching mailer.ts, so a
// misconfigured/missing value surfaces per-request rather than at boot.
function maxSizeBytes(): number {
  const mb = Number(process.env.POLICY_ATTACHMENT_MAX_SIZE_MB ?? "10")
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024
}

function dailyLimit(): number {
  const limit = Number(process.env.POLICY_ATTACHMENT_DAILY_LIMIT ?? "100")
  return Number.isFinite(limit) && limit > 0 ? limit : 100
}

// Strips path separators and control characters so a hostile file name can't
// escape the policy-scoped key prefix or otherwise corrupt the R2 key.
function sanitizeFileName(fileName: string): string {
  return Array.from(fileName.replace(/[/\\]/g, "_"))
    .filter((ch) => ch.codePointAt(0)! >= 0x20)
    .join("")
}

policyAttachmentsRouter.get(
  "/policy-attachments",
  requireAuth,
  async (req: Request, res: Response) => {
    const policyId = idParam.safeParse(req.query.policyId)
    if (!policyId.success) {
      res.status(400).json({ error: "Invalid policyId" })
      return
    }
    res.json(await listPolicyAttachmentsByPolicyId(policyId.data))
  }
)

policyAttachmentsRouter.get(
  "/policy-attachments/:id/link",
  requireAuth,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const query = attachmentLinkQuery.safeParse(req.query)
    if (!query.success) {
      res.status(400).json({ error: firstIssue(query.error) })
      return
    }

    const attachment = await findPolicyAttachmentById(id)
    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" })
      return
    }

    try {
      const url = await getPresignedDownloadUrl(
        attachment.storageKey,
        query.data.disposition === "attachment"
          ? { downloadFileName: attachment.fileName }
          : undefined
      )
      res.json({ url })
    } catch (err) {
      if (isR2NotConfigured(err, res)) return
      throw err
    }
  }
)

policyAttachmentsRouter.post(
  "/policy-attachments/presign",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = presignAttachmentBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    const policy = await findAutoPolicyById(parsed.data.policyId)
    if (!policy) {
      res.status(404).json({ error: "Policy not found" })
      return
    }

    if (parsed.data.sizeBytes > maxSizeBytes()) {
      res.status(413).json({ error: "File exceeds the maximum allowed size" })
      return
    }

    const uploadedToday = await countAttachmentsCreatedTodayByUser(req.user!.id)
    if (uploadedToday >= dailyLimit()) {
      res.status(429).json({ error: "Daily attachment upload limit reached" })
      return
    }

    const storageKey = `policy-attachments/${parsed.data.policyId}/${randomUUID()}-${sanitizeFileName(parsed.data.fileName)}`
    try {
      const uploadUrl = await getPresignedUploadUrl(storageKey, parsed.data.contentType)
      res.json({ uploadUrl, storageKey })
    } catch (err) {
      if (isR2NotConfigured(err, res)) return
      throw err
    }
  }
)

policyAttachmentsRouter.post(
  "/policy-attachments/confirm",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = confirmAttachmentBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    const policy = await findAutoPolicyById(parsed.data.policyId)
    if (!policy) {
      res.status(404).json({ error: "Policy not found" })
      return
    }

    // storageKey is server-generated at presign time and always prefixed with
    // the policyId, so cross-checking it here rejects a confirm call for an
    // object that was presigned for a different policy.
    if (!parsed.data.storageKey.startsWith(`policy-attachments/${parsed.data.policyId}/`)) {
      res.status(400).json({ error: "storageKey does not match policyId" })
      return
    }

    let head
    try {
      head = await headObject(parsed.data.storageKey)
    } catch (err) {
      if (isR2NotConfigured(err, res)) return
      throw err
    }
    if (!head) {
      res.status(400).json({ error: "Upload not found, please retry" })
      return
    }

    if (head.sizeBytes > maxSizeBytes()) {
      try {
        await deleteObject(parsed.data.storageKey)
      } catch (err) {
        if (isR2NotConfigured(err, res)) return
        throw err
      }
      res.status(413).json({ error: "File exceeds the maximum allowed size" })
      return
    }

    const attachment = await createPolicyAttachment({
      policyId: parsed.data.policyId,
      fileName: parsed.data.fileName,
      description: parsed.data.description ?? null,
      storageKey: parsed.data.storageKey,
      mimeType: head.contentType ?? "application/octet-stream",
      sizeBytes: head.sizeBytes,
      createdBy: req.user!.id,
    })
    res.status(201).json(attachment)
  }
)
