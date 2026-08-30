import { Request, Response, Router } from "express"
import { requireAuth, requireRole } from "../auth/middleware"
import { demoMode } from "../demo"
import { runReminderTickNow } from "../jobs/scheduler"
import {
  cancelScheduledEmail,
  createReminderRule,
  deleteReminderRule,
  findCorrespondenceTemplateById,
  findScheduledEmailById,
  listReminderRules,
  listScheduledEmails,
  updateReminderRule,
} from "../repositories"
import { firstIssue, isPgUniqueViolation, parseId } from "./helpers"
import { createReminderRuleBody, scheduledEmailQuery, updateReminderRuleBody } from "./schemas"

export const reminderRulesRouter = Router()

// Standing rules that turn a date on a policy into an automatic client email.
// Authoring is admin-only - a rule sends without anyone reviewing the result,
// so it is a strictly bigger capability than sending one template by hand.
// The GET is open to staff so the policy Activities tab can name the rule
// behind a scheduled reminder.

// Rules are unique on (trigger, offsetDays): two rules firing the same number
// of days out would send a client two emails on the same morning.
const DUPLICATE_OFFSET = "A rule already exists for that trigger and offset"

reminderRulesRouter.get(
  "/reminder-rules",
  requireAuth,
  requireRole("staff"),
  async (_req: Request, res: Response) => {
    res.json({ rules: await listReminderRules() })
  }
)

reminderRulesRouter.post(
  "/reminder-rules",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = createReminderRuleBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    // Kind-scoped lookup, so the singleton welcome invite can never be wired
    // up as a client-facing reminder.
    const template = await findCorrespondenceTemplateById(parsed.data.templateId)
    if (!template) {
      res.status(404).json({ error: "Template not found" })
      return
    }

    try {
      const rule = await createReminderRule({ ...parsed.data, updatedBy: req.user!.id })
      res.status(201).json(rule)
    } catch (err) {
      if (isPgUniqueViolation(err, "reminder_rules_trigger_offset_unique")) {
        res.status(409).json({ error: DUPLICATE_OFFSET })
        return
      }
      throw err
    }
  }
)

reminderRulesRouter.patch(
  "/reminder-rules/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const parsed = updateReminderRuleBody.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: firstIssue(parsed.error) })
      return
    }

    if (parsed.data.templateId !== undefined) {
      const template = await findCorrespondenceTemplateById(parsed.data.templateId)
      if (!template) {
        res.status(404).json({ error: "Template not found" })
        return
      }
    }

    try {
      const rule = await updateReminderRule(id, { ...parsed.data, updatedBy: req.user!.id })
      if (!rule) {
        res.status(404).json({ error: "Rule not found" })
        return
      }
      res.json(rule)
    } catch (err) {
      if (isPgUniqueViolation(err, "reminder_rules_trigger_offset_unique")) {
        res.status(409).json({ error: DUPLICATE_OFFSET })
        return
      }
      throw err
    }
  }
)

reminderRulesRouter.delete(
  "/reminder-rules/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    if (!(await deleteReminderRule(id))) {
      res.status(404).json({ error: "Rule not found" })
      return
    }
    res.status(204).send()
  }
)

// The agency-wide queue behind the admin page's Upcoming list. Staff-visible:
// seeing what is about to go out is the safety valve that makes auto-send
// comfortable, and it is the same data the policy Activities tab shows.
reminderRulesRouter.get("/scheduled-emails", requireAuth, async (req: Request, res: Response) => {
  const parsed = scheduledEmailQuery.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: firstIssue(parsed.error) })
    return
  }
  const scheduled = await listScheduledEmails({ statuses: parsed.data.status })
  res.json({ scheduled })
})

reminderRulesRouter.post(
  "/scheduled-emails/:id/cancel",
  requireAuth,
  requireRole("staff"),
  async (req: Request, res: Response) => {
    const id = parseId(req.params.id, res)
    if (id === undefined) return

    const cancelled = await cancelScheduledEmail(id)
    if (cancelled) {
      req.log.info({ scheduledEmailId: id, actorId: req.user?.id }, "scheduled reminder cancelled")
      res.json(cancelled)
      return
    }

    // The update matched nothing, which means either no such row or one that
    // isn't pending any more. Re-read to tell those apart.
    const existing = await findScheduledEmailById(id)
    if (!existing) {
      res.status(404).json({ error: "Scheduled email not found" })
      return
    }
    res.status(409).json({ error: `Cannot cancel a reminder that is already ${existing.status}` })
  }
)

// Runs one plan+dispatch pass synchronously, skipping the planner election so
// the caller always gets a real plan. Two jobs: it makes the engine testable
// and demoable without waiting on the timer, and it is the seam for driving
// the scheduler from outside the process (an external cron hitting this
// endpoint) with no code change.
reminderRulesRouter.post(
  "/reminders/tick",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    if (demoMode()) {
      res.status(403).json({ error: "Disabled in demo mode" })
      return
    }
    const result = await runReminderTickNow()
    req.log.info({ ...result, actorId: req.user?.id }, "reminder tick (manual)")
    res.json(result)
  }
)
