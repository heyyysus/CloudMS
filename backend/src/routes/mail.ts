import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import {
  createPolicyLog,
  findClientById,
  findCorrespondenceTemplateById,
  getClientWithDetails,
  getPolicyWithDetails,
  listEmailsByClientId,
} from "../repositories"
import {
  buildCorrespondenceMergeValues,
  correspondenceSentLogBody,
  sendCorrespondenceEmail,
} from "../emails"
import { DemoDisabledError } from "../demo"
import { firstIssue, parseId } from "./helpers"
import { MailNotConfiguredError, MailSendError, plainTextToHtml, sendEmail } from "../mailer"
import { sendClientEmailBody, sendCorrespondenceBody } from "./schemas"

export const mailRouter = Router()

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
  if (err instanceof DemoDisabledError) {
    req.log.error(err)
    res.status(403).json({ error: "Disabled in demo mode" })
    return true
  }
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
    const { templateId, to } = parsed.data
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

    try {
      const result = await sendCorrespondenceEmail({
        template,
        values: resolved.values,
        to,
        cc,
        triggeredBy: req.user!.id,
      })

      // Best-effort, and awaited before responding so the caller's next fetch
      // of the log already sees it. The mail is gone by now, so a log failure
      // is logged rather than turned into a 500 on a send that succeeded.
      try {
        await createPolicyLog({
          policyId,
          authorId: req.user!.id,
          body: correspondenceSentLogBody({
            to,
            cc,
            subject: result.subject,
            body: result.body,
          }),
        })
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
        },
        "correspondence sent"
      )
      res.status(201).json({ id: result.resendId, to, cc, subject: result.subject })
    } catch (err) {
      if (!handleMailError(err, req, res)) throw err
    }
  }
)
