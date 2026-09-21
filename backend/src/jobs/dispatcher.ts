import { and, eq, lt, sql } from "drizzle-orm"
import { adminDb } from "../db"
import { reminderRules, scheduledEmails } from "../db/schema"
import {
  buildCorrespondenceMergeValues,
  correspondenceSentLogBody,
  sendCorrespondenceEmail,
} from "../emails"
import { MailNotConfiguredError, MailSendError } from "../mailer"
import { logger } from "../logger"
import {
  createPolicyLog,
  findCorrespondenceTemplateById,
  findOrganizationById,
  getClientWithDetails,
  getPolicyWithDetails,
  listEmailsByClientId,
} from "../repositories"
import { agencyIdentity, reminderConfig } from "./config"
import { getAutomationUser } from "./automationUser"

export interface DispatchResult {
  claimed: number
  sent: number
  failed: number
  released: number
}

// Returns rows a container claimed but never finished - it was killed, or the
// process died mid-send. Runs before claiming so a stuck row rejoins the same
// pass that would have picked it up. This is the reason delivery is
// at-least-once rather than at-most-once: a container that died *after* Resend
// accepted the message will send it again here. For a renewal reminder a rare
// duplicate beats a rare miss.
async function releaseStaleClaims(claimTimeoutMs: number, orgId?: string): Promise<number> {
  const cutoff = new Date(Date.now() - claimTimeoutMs)
  const filters = [
    eq(scheduledEmails.status, "sending"),
    lt(scheduledEmails.claimedAt, cutoff),
    orgId !== undefined ? eq(scheduledEmails.orgId, orgId) : undefined,
  ].filter((f) => f !== undefined)
  const released = await adminDb
    .update(scheduledEmails)
    .set({ status: "pending", claimedAt: null, updatedAt: new Date() })
    .where(and(...filters))
    .returning({ id: scheduledEmails.id })
  return released.length
}

// snake_case because adminDb.execute returns raw driver rows, not
// drizzle-mapped ones. The index signature satisfies adminDb.execute's
// Record<string, unknown> constraint.
interface ClaimedRow extends Record<string, unknown> {
  id: string
  rule_id: string
  policy_id: string
  org_id: string
  attempts: number
}

// Claims a batch and commits immediately, so the Resend calls that follow
// happen outside any transaction. FOR UPDATE SKIP LOCKED is what lets every
// replica dispatch at once: a row another container is claiming is simply
// invisible here, so no coordination is needed beyond Postgres.
//
// orgId narrows the claim to one organization's queue - used by the manual
// tick, so it can't reap or send another org's rows.
async function claimBatch(batchSize: number, orgId?: string): Promise<ClaimedRow[]> {
  const claimed = await adminDb.execute<ClaimedRow>(sql`
    update scheduled_emails
    set status = 'sending',
        claimed_at = now() at time zone 'UTC',
        attempts = attempts + 1,
        updated_at = now() at time zone 'UTC'
    where id in (
      select id from scheduled_emails
      -- scheduled_for holds a UTC wall clock (see planner.ts), so compare it
      -- against one rather than against now() directly, which would be read in
      -- whatever TimeZone the session happens to be set to.
      where status = 'pending' and scheduled_for <= now() at time zone 'UTC'
        ${orgId !== undefined ? sql`and org_id = ${orgId}` : sql``}
      order by scheduled_for
      for update skip locked
      limit ${batchSize}
    )
    returning id, rule_id, policy_id, org_id, attempts
  `)
  return [...claimed.rows]
}

// A problem no retry can fix - a deleted template, a policy whose client went
// away. Distinguished from a transient send failure so the row is retired
// rather than retried three times to the same end.
class UnsendableError extends Error {}

async function sendOne(row: ClaimedRow): Promise<void> {
  const orgId = row.org_id

  const automation = await getAutomationUser()

  const rule = await adminDb.query.reminderRules.findFirst({
    where: eq(reminderRules.id, row.rule_id),
  })
  if (!rule) throw new UnsendableError("Reminder rule no longer exists")

  const template = await findCorrespondenceTemplateById(orgId, rule.templateId)
  if (!template) throw new UnsendableError("Correspondence template no longer exists")

  const policy = await getPolicyWithDetails(orgId, row.policy_id)
  if (!policy) throw new UnsendableError("Policy no longer exists")

  const client = await getClientWithDetails(orgId, policy.clientId)
  if (!client) throw new UnsendableError("Client no longer exists")

  // Resolved now rather than stored at plan time, so an address corrected
  // between planning and sending is the one actually used.
  const onFile = await listEmailsByClientId(orgId, policy.clientId)
  if (onFile.length === 0) throw new UnsendableError("Client has no email address on file")

  const org = await findOrganizationById(orgId)
  if (!org) throw new UnsendableError("Organization no longer exists")

  const values = buildCorrespondenceMergeValues({ client, policy, agent: agencyIdentity(org) })

  // Writes one email_log row per recipient and rethrows mail errors, which is
  // exactly what the retry logic below wants.
  const result = await sendCorrespondenceEmail({
    orgId,
    template,
    values,
    to: onFile.map((e) => e.email),
    cc: [],
    triggeredBy: automation.id,
  })

  await adminDb
    .update(scheduledEmails)
    .set({
      status: "sent",
      resendId: result.resendId,
      subject: result.subject,
      sentAt: new Date(),
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(scheduledEmails.id, row.id))

  // Best-effort, matching routes/mail.ts: the mail is already gone, so a
  // logging failure must not undo a successful send.
  try {
    await createPolicyLog(orgId, {
      policyId: row.policy_id,
      authorId: automation.id,
      body: correspondenceSentLogBody({
        to: onFile.map((e) => e.email),
        cc: [],
        subject: result.subject,
        body: result.body,
      }),
    })
  } catch (err) {
    logger.error({ err, scheduledEmailId: row.id }, "Failed to write reminder policy log")
  }
}

// Sends every reminder that is due. Safe to call concurrently on any number of
// containers. orgId narrows both the stale-claim reaper and the claim itself
// to one organization - used by the manual tick, so it can't touch another
// org's queue.
export async function dispatchReminders(orgId?: string): Promise<DispatchResult> {
  const cfg = reminderConfig()
  const released = await releaseStaleClaims(cfg.claimTimeoutMs, orgId)
  const rows = await claimBatch(cfg.batchSize, orgId)

  let sent = 0
  let failed = 0

  for (const row of rows) {
    try {
      await sendOne(row)
      sent++
    } catch (err) {
      if (err instanceof MailNotConfiguredError) {
        // A config problem, not a delivery failure. Hand the attempt back so a
        // missing RESEND_API_KEY doesn't quietly burn every reminder's retries
        // before anyone notices it isn't set.
        await adminDb
          .update(scheduledEmails)
          .set({
            status: "pending",
            claimedAt: null,
            attempts: sql`${scheduledEmails.attempts} - 1`,
            lastError: "Email sending is not configured",
            updatedAt: new Date(),
          })
          .where(eq(scheduledEmails.id, row.id))
        logger.error({ scheduledEmailId: row.id }, "Reminder held: mail is not configured")
        continue
      }

      const permanent = err instanceof UnsendableError
      const exhausted = row.attempts >= cfg.maxAttempts
      const message = err instanceof Error ? err.message : String(err)

      if (!permanent && !(err instanceof MailSendError)) throw err

      await adminDb
        .update(scheduledEmails)
        .set({
          status: permanent || exhausted ? "failed" : "pending",
          claimedAt: null,
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(scheduledEmails.id, row.id))

      if (permanent || exhausted) failed++
      logger.error({ err, scheduledEmailId: row.id, permanent, exhausted }, "Reminder send failed")
    }
  }

  return { claimed: rows.length, sent, failed, released }
}
