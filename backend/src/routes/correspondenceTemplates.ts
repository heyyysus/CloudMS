import { randomUUID } from "crypto"
import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { CORRESPONDENCE_MERGE_FIELDS, extractMergeFields } from "../emails"
import {
  createCorrespondenceTemplate,
  deleteCorrespondenceTemplate,
  findCorrespondenceTemplateById,
  listCorrespondenceTemplates,
  updateCorrespondenceTemplate,
} from "../repositories"
import { firstIssue, parseId } from "./helpers"
import { createCorrespondenceTemplateBody, updateCorrespondenceTemplateBody } from "./schemas"

export const correspondenceTemplatesRouter = Router()

// Correspondence templates are admin-only client-facing email templates,
// distinct from the singleton "welcome" invite email (see emailTemplates.ts).
// Routed by id, so the welcome route's :key surface is untouched.

// Derives a stable, human-readable unique key from the template name. The key
// is kept (NOT NULL unique) for email_log durability when sends land later; a
// short random suffix sidesteps collision-retry logic.
function keyFromName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return `correspondence-${slug || "template"}-${randomUUID().slice(0, 8)}`
}

// Rejects any {{field}} the correspondence catalog doesn't define, mirroring
// the welcome PUT route. Returns the error message, or null when all fields
// are known.
function unknownMergeFieldError(subject: string, body: string): string | null {
  const unknown = extractMergeFields(`${subject}\n${body}`).filter(
    (field) => !CORRESPONDENCE_MERGE_FIELDS.includes(field as never)
  )
  if (unknown.length === 0) return null
  return `Unknown merge fields: ${unknown.map((field) => `{{${field}}}`).join(", ")}`
}

correspondenceTemplatesRouter.get(
  "/correspondence-templates",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response) => {
    const templates = await listCorrespondenceTemplates()
    res.json({ templates, mergeFields: CORRESPONDENCE_MERGE_FIELDS })
  }
)

correspondenceTemplatesRouter.post(
  "/correspondence-templates",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = createCorrespondenceTemplateBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const { name, subject, body } = parsed.data

    const mergeError = unknownMergeFieldError(subject, body)
    if (mergeError) {
      res.status(400).json({ error: mergeError })
      return
    }

    const template = await createCorrespondenceTemplate({
      key: keyFromName(name),
      name,
      subject,
      body,
      updatedBy: req.user!.id,
    })
    res.status(201).json(template)
  }
)

correspondenceTemplatesRouter.patch(
  "/correspondence-templates/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const parsed = updateCorrespondenceTemplateBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }
    const { name, subject, body } = parsed.data

    const mergeError = unknownMergeFieldError(subject, body)
    if (mergeError) {
      res.status(400).json({ error: mergeError })
      return
    }

    const template = await updateCorrespondenceTemplate(id, {
      name,
      subject,
      body,
      updatedBy: req.user!.id,
    })
    if (!template) {
      res.status(404).json({ error: "Template not found" })
      return
    }
    res.json(template)
  }
)

correspondenceTemplatesRouter.delete(
  "/correspondence-templates/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const deleted = await deleteCorrespondenceTemplate(id)
    if (!deleted) {
      res.status(404).json({ error: "Template not found" })
      return
    }
    res.status(204).send()
  }
)
