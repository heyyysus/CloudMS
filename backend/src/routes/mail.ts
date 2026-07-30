import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { findClientById, listEmailsByClientId } from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { MailNotConfiguredError, MailSendError, plainTextToHtml, sendEmail } from "../mailer"
import { sendClientEmailBody } from "./schemas"

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
      if (err instanceof MailNotConfiguredError) {
        req.log.error(err)
        res.status(503).json({ error: "Email sending is not configured" })
        return
      }
      if (err instanceof MailSendError) {
        req.log.error(err)
        res.status(502).json({ error: "Email delivery is unavailable" })
        return
      }
      throw err
    }
  }
)
