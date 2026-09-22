// Every knob the reminder scheduler reads, resolved from process.env at the
// call site rather than cached at module load - the convention mailer.ts and
// storage/r2.ts both follow, and what lets tests mutate a value between cases.

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export interface ReminderConfig {
  tickMs: number
  horizonDays: number
  lookbackDays: number
  batchSize: number
  maxAttempts: number
  claimTimeoutMs: number
}

export function reminderConfig(): ReminderConfig {
  return {
    tickMs: num("REMINDER_TICK_MS", 60_000),
    // How far ahead rows are planned. Because they exist days before they are
    // due, an outage shorter than this sends late rather than not at all.
    horizonDays: num("REMINDER_HORIZON_DAYS", 7),
    // Covers only policies created or edited during an outage; keeping it
    // small is what stops a long gap from blasting out stale reminders.
    lookbackDays: num("REMINDER_LOOKBACK_DAYS", 1),
    batchSize: num("REMINDER_BATCH_SIZE", 10),
    maxAttempts: num("REMINDER_MAX_ATTEMPTS", 3),
    claimTimeoutMs: num("REMINDER_CLAIM_TIMEOUT_MS", 5 * 60_000),
  }
}

export function remindersEnabled(): boolean {
  return process.env.REMINDERS_ENABLED !== "false"
}

// The identity that renders into {{agentName}}/{{agentEmail}} on an automated
// send. Distinct from the automation *user*, which supplies authorship: a
// client should read the agency's (organization's) name, not "CloudMS
// Automation". Pure - the caller already has the organization in hand and
// passes its name and reply-to in. "" (not undefined) is the empty case,
// since the result renders into a {{agentEmail}} template string.
export function agencyIdentity(org: { name: string; mailReplyTo: string | null }): {
  name: string
  email: string
} {
  return {
    name: org.name,
    email: org.mailReplyTo ?? "",
  }
}
