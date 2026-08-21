import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createPolicyLog,
  findClientById,
  findCorrespondenceTemplateById,
  findPolicyAttachmentById,
  getClientWithDetails,
  getPolicyWithDetails,
  linkAttachmentsToLog,
  listEmailsByClientId,
} from "../repositories"
import {
  buildCorrespondenceMergeValues,
  correspondenceSentLogBody,
  sendCorrespondenceEmail,
} from "../emails"
import { firstIssue, parseId } from "./helpers"
import {
  MailNotConfiguredError,
  MailSendError,
  plainTextToHtml,
  sendEmail,
  type EmailAttachment,
} from "../mailer"
import { getObject, R2NotConfiguredError } from "../storage/r2"
import { sendClientEmailBody, sendCorrespondenceBody } from "./schemas"

export const mailRouter = Router()

// Total attached bytes a single correspondence send may carry. Well under
// Resend's 40 MB per-message ceiling, leaving room for the base64 overhead
// (~33%) and the message body itself. Per-file size is already capped at
// upload time.
const MAX_ATTACHMENT_TOTAL_BYTES = 25 * 1024 * 1024

// Sends an email to one or more of a client's on-file addresses. Admin-only:
// this is a free-text send, so it's scoped to admins rather than all staff.
// Recipients are restricted to addresses already on the client record - `to`
// narrows which of those addresses get the message, it never adds a new one,
// so a compromised session can't turn this into an open relay to arbitrary
// addresses.
mailRouter.post(
  "/clients/:clientId/send-email",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const clientId = parseId(req.params.clientId, res)
    if (clientId === undefined) return

    const parsed = sendClientEmailBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    const client = await findClientById(clientId)
    if (!client) {
      res.status(404).json({ error: "Client not found" })
      return
    }

    const onFile = await listEmailsByClientId(clientId)
    if (onFile.length === 0) {
      res.status(422).json({ error: "Client has no email address on file" })
      return
    }
    const onFileSet = new Set(onFile.map((e) => e.email.toLowerCase()))

    const { subject, body, to: requestedTo } = parsed.data
    const to = requestedTo ?? onFile.map((e) => e.email)

    const unknown = to.filter((addr) => !onFileSet.has(addr.toLowerCase()))
    if (unknown.length > 0) {
      res.status(400).json({ error: `Not on file for this client: ${unknown.join(", ")}` })
      return
    }

    try {
      const result = await sendEmail({ to, subject, html: plainTextToHtml(body), text: body })
      req.log.info(
        { clientId, to, actorId: req.user?.id, resendId: result.id },
        "client email sent"
      )
      res.status(201).json({ id: result.id, to })
    } catch (err) {
      if (!handleMailError(err, req, res)) throw err
    }
  }
)

// Maps a mail failure onto a response, so both the free-text send above and
// the correspondence send below answer 503/502 identically. Returns false for
// anything else, which the caller rethrows.
function handleMailError(err: unknown, req: Request, res: Response): boolean {
  if (err instanceof MailNotConfiguredError) {
    req.log.error(err)
    res.status(503).json({ error: "Email sending is not configured" })
    return true
  }
  if (err instanceof MailSendError) {
    req.log.error(err)
    res.status(502).json({ error: "Email delivery is unavailable" })
    return true
  }
  if (err instanceof R2NotConfiguredError) {
    req.log.error(err)
    res.status(503).json({ error: "File storage is not configured" })
    return true
  }
  return false
}

// Loads a policy and its client and resolves every correspondence merge field
// against them. Shared by the preview GET and the send POST so the values the
// dialog previews are built by exactly the same code that renders the sent
// message. Returns undefined when the policy (or its client) is missing.
async function resolveMergeValues(policyId: number, agent: Express.Request["user"]) {
  const policy = await getPolicyWithDetails(policyId)
  if (!policy) return undefined
  const client = await getClientWithDetails(policy.clientId)
  if (!client) return undefined
  return {
    policy,
    values: buildCorrespondenceMergeValues({ client, policy, agent: agent! }),
  }
}

// A policy attachment cleared for sending: DB row vetted (right policy, not
// voided, within the size budget), bytes not yet read. The route fetches the
// bytes from R2 only once everything else about the send has checked out.
interface ResolvedAttachment {
  id: number
  fileName: string
  storageKey: string
}

type ResolveAttachmentsResult =
  | { status: "ok"; attachments: ResolvedAttachment[] }
  | { status: "error"; code: number; message: string }

// Vets the requested attachment ids against the policy without touching R2:
// each must exist, belong to this policy, not be voided (no emailing a
// reversed receipt), and the batch must fit the size budget. Duplicate ids are
// collapsed. Returns the vetted rows, or the response the route should send.
async function resolveAttachments(
  policyId: number,
  attachmentIds: number[] | undefined
): Promise<ResolveAttachmentsResult> {
  const ids = [...new Set(attachmentIds ?? [])]
  if (ids.length === 0) return { status: "ok", attachments: [] }

  const rows = await Promise.all(ids.map((id) => findPolicyAttachmentById(id)))

  const attachments: ResolvedAttachment[] = []
  let totalBytes = 0
  for (const row of rows) {
    if (!row) return { status: "error", code: 404, message: "Attachment not found" }
    if (row.policyId !== policyId) {
      return { status: "error", code: 400, message: "Attachment belongs to another policy" }
    }
    if (row.isVoided) {
      return { status: "error", code: 400, message: "Cannot send a voided attachment" }
    }
    totalBytes += row.sizeBytes
    attachments.push({ id: row.id, fileName: row.fileName, storageKey: row.storageKey })
  }

  if (totalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    const limitMb = Math.floor(MAX_ATTACHMENT_TOTAL_BYTES / (1024 * 1024))
    return { status: "error", code: 400, message: `Attachments exceed the ${limitMb} MB limit` }
  }

  return { status: "ok", attachments }
}

// Reads each vetted attachment out of R2 and base64-encodes it for Resend.
// Kept separate from resolveAttachments so its R2 failures surface inside the
// route's try/catch (mapped to 503) rather than during validation.
async function loadAttachmentContents(
  attachments: ResolvedAttachment[]
): Promise<EmailAttachment[]> {
  return Promise.all(
    attachments.map(async (a) => ({
      filename: a.fileName,
      content: (await getObject(a.storageKey)).toString("base64"),
    }))
  )
}

// Backs the preview pane of the send dialog. Returning the value map (rather
// than a rendered message) lets the client re-preview instantly as the user
// switches templates, using the renderPreview() mirror of renderTemplate.
mailRouter.get(
  "/policies/:policyId/merge-fields",
  requireAuth,
  async (req: Request, res: Response) => {
    const policyId = parseId(req.params.policyId, res)
    if (policyId === undefined) return

    const resolved = await resolveMergeValues(policyId, req.user)
    if (!resolved) {
      res.status(404).json({ error: "Policy not found" })
      return
    }

    res.json({ values: resolved.values })
  }
)

// Sends an admin-authored correspondence template to a client, scoped to one
// policy so the message can merge that policy's details and so the send lands
// in that policy's log. Open to staff (requireRole("staff") admits admins too)
// because routine client contact is staff work - what keeps that safe is that
// staff choose only *which* template goes out, never its wording.
mailRouter.post(
  "/policies/:policyId/send-correspondence",
  requireAuth,
  requireRole("staff"),
  async (req: Request, res: Response) => {
    const policyId = parseId(req.params.policyId, res)
    if (policyId === undefined) return

    const parsed = sendCorrespondenceBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const { templateId, to, attachmentIds } = parsed.data
    const cc = parsed.data.cc ?? []

    // Both lists are already lowercased by the schema, so this catches the
    // case-different duplicate too. Resend would otherwise deliver twice.
    const toSet = new Set(to)
    const overlap = cc.filter((addr) => toSet.has(addr))
    if (overlap.length > 0) {
      res.status(400).json({ error: `Already in To: ${overlap.join(", ")}` })
      return
    }

    // Scoped to kind = "correspondence" by the repository, so the welcome
    // invite template can never be aimed at a client.
    const template = await findCorrespondenceTemplateById(templateId)
    if (!template) {
      res.status(404).json({ error: "Template not found" })
      return
    }

    const resolved = await resolveMergeValues(policyId, req.user)
    if (!resolved) {
      res.status(404).json({ error: "Policy not found" })
      return
    }

    // Vet the attachments against the policy before sending anything; byte
    // fetching from R2 happens below, inside the try, so its failures map to a
    // 503 rather than escaping validation.
    const attachmentsResult = await resolveAttachments(policyId, attachmentIds)
    if (attachmentsResult.status === "error") {
      res.status(attachmentsResult.code).json({ error: attachmentsResult.message })
      return
    }
    const vettedAttachments = attachmentsResult.attachments

    try {
      const emailAttachments = await loadAttachmentContents(vettedAttachments)
      const result = await sendCorrespondenceEmail({
        template,
        values: resolved.values,
        to,
        cc,
        triggeredBy: req.user!.id,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      })

      // Best-effort, and awaited before responding so the caller's next fetch
      // of the log already sees it. The mail is gone by now, so a log failure
      // is logged rather than turned into a 500 on a send that succeeded.
      try {
        const log = await createPolicyLog({
          policyId,
          authorId: req.user!.id,
          body: correspondenceSentLogBody({
            to,
            cc,
            subject: result.subject,
            body: result.body,
            attachments: vettedAttachments.map((a) => a.fileName),
          }),
        })

        // Tie the sent files to the log row so opening it shows exactly which
        // documents went out. Same-policy is re-checked inside the repository.
        if (log && vettedAttachments.length > 0) {
          await linkAttachmentsToLog({
            logId: log.id,
            attachmentIds: vettedAttachments.map((a) => a.id),
            linkedBy: req.user!.id,
          })
        }
      } catch (err) {
        req.log.error(err, "Failed to write correspondence policy log")
      }

      req.log.info(
        {
          policyId,
          to,
          cc,
          actorId: req.user?.id,
          templateKey: template.key,
          resendId: result.resendId,
          attachmentCount: vettedAttachments.length,
        },
        "correspondence sent"
      )
      res.status(201).json({ id: result.resendId, to, cc, subject: result.subject })
    } catch (err) {
      if (!handleMailError(err, req, res)) throw err
    }
  }
)
