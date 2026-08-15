import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { extractMergeFields, WELCOME_MERGE_FIELDS, WELCOME_TEMPLATE_KEY } from "../emails"
import { findEmailTemplateByKey, upsertEmailTemplate } from "../repositories"
import { firstIssue } from "./helpers"
import { updateEmailTemplateBody } from "./schemas"

export const emailTemplatesRouter = Router()

// Whitelists which template keys exist and which merge fields each one may
// use. Keeps the route generic (:key) without letting PUT mint arbitrary
// template rows for keys nothing ever sends.
const TEMPLATE_MERGE_FIELDS: Record<string, readonly string[]> = {
  [WELCOME_TEMPLATE_KEY]: WELCOME_MERGE_FIELDS,
}

emailTemplatesRouter.get(
  "/email-templates/:key",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const key = String(req.params.key)
    const mergeFields = TEMPLATE_MERGE_FIELDS[key]
    if (!mergeFields) {
      res.status(404).json({ error: "Unknown template" })
      return
    }

    const template = await findEmailTemplateByKey(key)
    if (!template) {
      res.status(404).json({ error: "Unknown template" })
      return
    }

    res.json({ template, mergeFields })
  }
)

emailTemplatesRouter.put(
  "/email-templates/:key",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const key = String(req.params.key)
    const mergeFields = TEMPLATE_MERGE_FIELDS[key]
    if (!mergeFields) {
      res.status(404).json({ error: "Unknown template" })
      return
    }

    const parsed = updateEmailTemplateBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const { subject, body } = parsed.data

    const unknown = extractMergeFields(`${subject}\n${body}`).filter(
      (field) => !mergeFields.includes(field)
    )
    if (unknown.length > 0) {
      res.status(400).json({
        error: `Unknown merge fields: ${unknown.map((field) => `{{${field}}}`).join(", ")}`,
      })
      return
    }

    const template = await upsertEmailTemplate({
      key,
      subject,
      body,
      updatedBy: req.user!.id,
    })
    res.json({ template, mergeFields })
  }
)
