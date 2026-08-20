import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "../db"
import {
  autoPolicies,
  clients,
  emailTemplates,
  persons,
  reminderRules,
  scheduledEmails,
} from "../db/schema"
import type { ScheduledEmail } from "../types"

export type ScheduledEmailStatus = ScheduledEmail["status"]

export interface ScheduledEmailWithContext {
  id: number
  status: ScheduledEmailStatus
  scheduledFor: Date
  sentAt: Date | null
  occurrenceDate: string
  attempts: number
  lastError: string | null
  subject: string | null
  ruleName: string | null
  templateName: string | null
  policyId: number
  policyNumber: string
  clientId: number
  clientName: string
}

// The one query behind both views: the admin's agency-wide queue and a single
// policy's Activities tab. They differ only by this filter, so they stay one
// function rather than two that can drift apart.
export async function listScheduledEmails(options: {
  policyId?: number
  statuses?: ScheduledEmailStatus[]
  limit?: number
}): Promise<ScheduledEmailWithContext[]> {
  const filters = [
    options.policyId !== undefined ? eq(scheduledEmails.policyId, options.policyId) : undefined,
    options.statuses && options.statuses.length > 0
      ? inArray(scheduledEmails.status, options.statuses)
      : undefined,
  ].filter((f) => f !== undefined)

  const rows = await db
    .select({
      id: scheduledEmails.id,
      status: scheduledEmails.status,
      scheduledFor: scheduledEmails.scheduledFor,
      sentAt: scheduledEmails.sentAt,
      occurrenceDate: scheduledEmails.occurrenceDate,
      attempts: scheduledEmails.attempts,
      lastError: scheduledEmails.lastError,
      subject: scheduledEmails.subject,
      ruleName: reminderRules.name,
      templateName: emailTemplates.name,
      policyId: scheduledEmails.policyId,
      policyNumber: autoPolicies.policyNumber,
      clientId: autoPolicies.clientId,
      clientName: sql<string>`${persons.firstName} || ' ' || ${persons.lastName}`,
    })
    .from(scheduledEmails)
    .leftJoin(reminderRules, eq(scheduledEmails.ruleId, reminderRules.id))
    .leftJoin(emailTemplates, eq(reminderRules.templateId, emailTemplates.id))
    .innerJoin(autoPolicies, eq(scheduledEmails.policyId, autoPolicies.id))
    .innerJoin(clients, eq(autoPolicies.clientId, clients.id))
    .innerJoin(persons, eq(clients.namedInsuredId, persons.id))
    .where(filters.length > 0 ? and(...filters) : undefined)
    // Soonest-first among what hasn't happened, which puts the next reminder
    // at the top of both views.
    .orderBy(asc(scheduledEmails.scheduledFor), desc(scheduledEmails.id))
    .limit(options.limit ?? 100)

  return rows
}

export async function findScheduledEmailById(id: number): Promise<ScheduledEmail | undefined> {
  const [row] = await db.select().from(scheduledEmails).where(eq(scheduledEmails.id, id))
  return row
}

// Only a pending row can be cancelled - one already claimed by a dispatcher
// may be mid-flight at Resend, and a sent one is gone. The status guard is in
// the WHERE rather than a read-then-write so a cancel racing a claim loses
// cleanly instead of cancelling something already sent.
export async function cancelScheduledEmail(id: number): Promise<ScheduledEmail | undefined> {
  const [row] = await db
    .update(scheduledEmails)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(scheduledEmails.id, id), eq(scheduledEmails.status, "pending")))
    .returning()
  return row
}
