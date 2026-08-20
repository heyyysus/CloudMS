import { Request, Response, Router } from "express"
import { requireAuth } from "../auth/middleware"
import { listScheduledEmails, type ScheduledEmailWithContext } from "../repositories"
import { parseId } from "./helpers"

export const policyActivitiesRouter = Router()

// What is scheduled to happen on a policy, for the Activities subtab.
//
// Deliberately not shaped as "a list of scheduled emails": the id is a
// namespaced string and every row carries `kind`/`source`, so when manually
// created tasks arrive they union into this list without changing the
// contract the frontend already renders. Today scheduled_emails is the only
// source, and every row is source "automation".
export interface PolicyActivity {
  id: string
  kind: "reminder"
  title: string
  detail: string | null
  scheduledFor: string
  sentAt: string | null
  status: ScheduledEmailWithContext["status"]
  source: "automation"
  cancellable: boolean
  lastError: string | null
}

function toActivity(row: ScheduledEmailWithContext): PolicyActivity {
  return {
    // Namespaced so a future policy_tasks row ("task:7") can never collide
    // with a scheduled email that happens to share its numeric id.
    id: `scheduled-email:${row.id}`,
    kind: "reminder",
    title: row.ruleName ?? "Reminder",
    // The rendered subject once sent, the template's name before that - the
    // most specific thing known at each stage.
    detail: row.subject ?? row.templateName,
    scheduledFor: row.scheduledFor.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    status: row.status,
    source: "automation",
    // Only a pending row can still be stopped; the cancel route enforces this
    // too, in a WHERE clause, so a stale UI can't cancel something in flight.
    cancellable: row.status === "pending",
    lastError: row.lastError,
  }
}

// Returns completed activities alongside upcoming ones, so the tab shows the
// reminder history rather than emptying out the moment everything has sent.
policyActivitiesRouter.get(
  "/policies/:policyId/activities",
  requireAuth,
  async (req: Request, res: Response) => {
    const policyId = parseId(req.params.policyId, res)
    if (policyId === undefined) return

    const scheduled = await listScheduledEmails({ policyId })
    res.json({ activities: scheduled.map(toActivity) })
  }
)
