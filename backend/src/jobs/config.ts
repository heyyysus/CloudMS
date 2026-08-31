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
  timeZone: string
  sendHour: number
  horizonDays: number
  lookbackDays: number
  batchSize: number
  maxAttempts: number
  claimTimeoutMs: number
}

export function reminderConfig(): ReminderConfig {
  return {
    tickMs: num("REMINDER_TICK_MS", 60_000),
    // An IANA zone, handed to Postgres' AT TIME ZONE so the send hour tracks
    // DST without any date math here.
    timeZone: process.env.REMINDER_TIMEZONE ?? "America/Chicago",
    sendHour: num("REMINDER_SEND_HOUR", 9),
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

export interface DemoReseedConfig {
  intervalMs: number
}

const DEMO_RESEED_DEFAULT_MINUTES = 15

export function demoReseedConfig(): DemoReseedConfig {
  const minutes = num("DEMO_RESEED_INTERVAL_MINUTES", DEMO_RESEED_DEFAULT_MINUTES)
  // num() already falls back on NaN, but not on a non-positive value - "0"
  // would otherwise produce a zero-delay interval that reseeds in a hot loop.
  return { intervalMs: (minutes > 0 ? minutes : DEMO_RESEED_DEFAULT_MINUTES) * 60_000 }
}

// The identity that renders into {{agentName}}/{{agentEmail}} on an automated
// send. Distinct from the automation *user*, which supplies authorship: a
// client should read the agency's name, not "CloudMS Automation".
export function agencyIdentity(): { name: string | null; email: string } {
  return {
    name: process.env.AGENCY_NAME ?? null,
    email: process.env.MAIL_REPLY_TO ?? "",
  }
}
