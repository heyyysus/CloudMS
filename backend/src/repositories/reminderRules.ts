import { and, asc, eq } from "drizzle-orm"
import { db } from "../db"
import { emailTemplates, reminderRules } from "../db/schema"
import type { ReminderRule } from "../types"

// A rule plus the template it sends, which is what every caller actually
// wants - a rule showing a bare templateId is useless in the admin list.
export interface ReminderRuleWithTemplate extends ReminderRule {
  template: { id: string; key: string; name: string | null; subject: string } | null
}

export async function listReminderRules(orgId: string): Promise<ReminderRuleWithTemplate[]> {
  const rows = await db
    .select({
      rule: reminderRules,
      template: {
        id: emailTemplates.id,
        key: emailTemplates.key,
        name: emailTemplates.name,
        subject: emailTemplates.subject,
      },
    })
    .from(reminderRules)
    .leftJoin(
      emailTemplates,
      and(eq(reminderRules.templateId, emailTemplates.id), eq(emailTemplates.orgId, orgId))
    )
    .where(eq(reminderRules.orgId, orgId))
    .orderBy(asc(reminderRules.offsetDays))
  return rows.map((row) => ({ ...row.rule, template: row.template }))
}

export async function findReminderRuleById(
  orgId: string,
  id: string
): Promise<ReminderRule | undefined> {
  const [row] = await db
    .select()
    .from(reminderRules)
    .where(and(eq(reminderRules.id, id), eq(reminderRules.orgId, orgId)))
  return row
}

export async function createReminderRule(
  orgId: string,
  input: {
    name: string
    trigger: "policy_expiration"
    offsetDays: number
    templateId: string
    enabled: boolean
    updatedBy: string | null
  }
): Promise<ReminderRule> {
  const [row] = await db
    .insert(reminderRules)
    .values({ ...input, orgId })
    .returning()
  return row
}

export async function updateReminderRule(
  orgId: string,
  id: string,
  input: {
    name?: string
    offsetDays?: number
    templateId?: string
    enabled?: boolean
    updatedBy: string | null
  }
): Promise<ReminderRule | undefined> {
  const [row] = await db
    .update(reminderRules)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(reminderRules.id, id), eq(reminderRules.orgId, orgId)))
    .returning()
  return row
}

// Cascades the rule's scheduled_emails rows away. That is deliberate:
// email_log is the permanent record of what was actually sent, so the queue
// carries no audit value of its own once its rule is gone.
export async function deleteReminderRule(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(reminderRules)
    .where(and(eq(reminderRules.id, id), eq(reminderRules.orgId, orgId)))
    .returning({ id: reminderRules.id })
  return deleted.length > 0
}
