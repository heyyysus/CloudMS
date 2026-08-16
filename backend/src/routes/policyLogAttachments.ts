// Links between a policy's logs and its attachments. Kept as a flat resource
// rather than nested under /policy-logs/:id because the read is batched per
// policy (one call serves every log the client renders) and the write points
// many attachments at one log, which neither nesting expresses well.
//
// Unlike logs and attachments, links are not append-only: an association is an
// editorial judgement, so any authenticated user can undo one - including a
// link somebody else made, matching "users can link to anyone's logs".

import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import {
  linkAttachmentsToLog,
  listPolicyLogAttachmentsByPolicyId,
  unlinkPolicyLogAttachment,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { idParam, linkPolicyLogAttachmentsBody } from "./schemas"

export const policyLogAttachmentsRouter = Router()

policyLogAttachmentsRouter.get(
  "/policy-log-attachments",
  requireAuth,
  async (req: Request, res: Response) => {
    const policyId = idParam.safeParse(req.query.policyId)
    if (!policyId.success) {
      res.status(400).json({ error: "Invalid policyId" })
      return
    }
    // Same visibility rule as GET /policy-attachments: a document for a voided
    // invoice or payment drops out of its log for staff, stays for admins.
    res.json(
      await listPolicyLogAttachmentsByPolicyId(policyId.data, {
        includeVoided: req.user!.role === "admin",
      })
    )
  }
)

policyLogAttachmentsRouter.post(
  "/policy-log-attachments",
  requireAuth,
  async (req: Request, res: Response) => {
    const parsed = linkPolicyLogAttachmentsBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    const result = await linkAttachmentsToLog({
      logId: parsed.data.logId,
      attachmentIds: parsed.data.attachmentIds,
      linkedBy: req.user!.id,
    })

    switch (result.status) {
      case "log_not_found":
        res.status(404).json({ error: "Log not found" })
        return
      case "attachment_not_found":
        res.status(404).json({ error: "Attachment not found" })
        return
      case "cross_policy":
        res.status(400).json({ error: "Attachment and log belong to different policies" })
        return
      case "ok":
        res.status(201).json(result.links)
        return
    }
  }
)

policyLogAttachmentsRouter.delete(
  "/policy-log-attachments/:id",
  requireAuth,
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    if (!(await unlinkPolicyLogAttachment(id))) {
      res.status(404).json({ error: "Link not found" })
      return
    }
    res.status(204).send()
  }
)
