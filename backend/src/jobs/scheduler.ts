import { demoMode } from "../demo"
import { logger } from "../logger"
import { reminderConfig, remindersEnabled } from "./config"
import { dispatchReminders, type DispatchResult } from "./dispatcher"
import { planDueReminders, planReminders, type PlanResult } from "./planner"

export interface TickResult {
  plan: PlanResult
  dispatch: DispatchResult
}

// One full pass, as the timer runs it: plan only if this container wins the
// election, then send whatever is ready.
export async function runReminderTick(): Promise<TickResult> {
  const plan = await planReminders()
  const dispatch = await dispatchReminders()
  return { plan, dispatch }
}

// The same pass for a caller who asked for it explicitly. Skips the election:
// an admin who clicks Run now wants a plan, not "another container was
// already planning, so nothing happened". Safe to overlap with a timer tick -
// planning is idempotent and dispatch claims rows with SKIP LOCKED.
export async function runReminderTickNow(): Promise<TickResult> {
  const created = await planDueReminders()
  const dispatch = await dispatchReminders()
  return { plan: { planned: true, created }, dispatch }
}

// A tick can outlast the interval - a batch of ten sends against a slow Resend
// takes longer than a minute. Without this the timer would stack passes on top
// of each other.
let running = false

async function tick(): Promise<void> {
  if (running) return
  running = true
  try {
    const result = await runReminderTick()
    if (result.plan.created > 0 || result.dispatch.claimed > 0 || result.dispatch.released > 0) {
      logger.info(result, "reminder tick")
    }
  } catch (err) {
    // Never let a bad tick take the process down - the next one retries.
    logger.error(err, "Reminder tick failed")
  } finally {
    running = false
  }
}

// Started from src/index.ts only, never app.ts: the supertest suites import
// app directly, and a timer there would leak into every test file.
export function startReminderScheduler(): NodeJS.Timeout | undefined {
  if (demoMode()) {
    logger.info("Reminder scheduler disabled (DEMO_MODE)")
    return undefined
  }
  if (!remindersEnabled()) {
    logger.info("Reminder scheduler disabled (REMINDERS_ENABLED=false)")
    return undefined
  }
  const { tickMs } = reminderConfig()
  logger.info({ tickMs }, "Reminder scheduler started")
  // unref so a pending timer never holds the process open on shutdown.
  return setInterval(() => void tick(), tickMs).unref()
}
