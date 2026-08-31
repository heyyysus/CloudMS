import { sql } from "drizzle-orm"
import { demoMode } from "../config"
import { db } from "../db"
import { ensureBootstrapRows } from "../db/bootstrap"
import { seed as defaultSeed, type SeedCounts } from "../db/seed/run"
import { clients } from "../db/schema"
import { logger } from "../logger"
import { resetAutomationUserCache } from "./automationUser"
import { demoReseedConfig } from "./config"

// Parsed only for the boot-time log line ("which database is this thing
// about to wipe?"), never used to connect - `db` already holds the pool.
function databaseNameFromUrl(url: string | undefined): string {
  if (!url) return "(unknown)"
  try {
    return new URL(url).pathname.replace(/^\//, "") || "(unknown)"
  } catch {
    return "(unknown)"
  }
}

// A tick can outlast the interval on a slow reseed - without this the timer
// would stack passes on top of each other, same reasoning as the reminder
// scheduler's guard.
let running = false

// The tick body, exported so a test can drive one pass directly without a
// timer. `seedFn` defaults to the real seed() but is injectable so the
// overlap guard and error handling can be tested without touching a
// database (see demoReseed.test.ts - wipe() truncates the whole database,
// so tests must never call the real seed against the shared one).
export async function runDemoReseed(
  seedFn: (options: { preserveDemoUsers: boolean }) => Promise<SeedCounts> = defaultSeed
): Promise<void> {
  if (running) return
  running = true
  try {
    const counts = await seedFn({ preserveDemoUsers: true })
    // The reseed wipes the automation user along with everything else that
    // isn't a demo user, then ensureBootstrapRows() recreates it below with a
    // new id - the cached row from before the wipe is now stale.
    await ensureBootstrapRows()
    resetAutomationUserCache()
    logger.info({ counts }, "Demo reseed")
  } catch (err) {
    // Never let a bad reseed take the process down - the next tick retries.
    logger.error(err, "Demo reseed failed")
  } finally {
    running = false
  }
}

// Started from src/index.ts only, never app.ts: the supertest suites import
// app directly, and a timer that truncates the database has no business
// leaking into the test process. Belt and braces: also refuse under
// NODE_ENV=test even if something did start it there.
export function startDemoReseedScheduler(): NodeJS.Timeout | undefined {
  if (!demoMode() || process.env.NODE_ENV === "test") {
    return undefined
  }

  const { intervalMs } = demoReseedConfig()
  const dbName = databaseNameFromUrl(process.env.DATABASE_URL)
  logger.info({ intervalMs, database: dbName }, "Demo reseed scheduler started")

  // Fire once on boot if the database looks empty, so a fresh demo container
  // comes up with data instead of a blank screen for a full interval. Done
  // asynchronously so a slow/unreachable database never blocks app.listen's
  // callback.
  void db
    .select({ count: sql<number>`count(*)` })
    .from(clients)
    .then(([{ count }]) => {
      // pg returns count(*) as a string - compare numerically.
      if (Number(count) === 0) void runDemoReseed()
    })
    .catch((err) => logger.error(err, "Demo reseed boot check failed"))

  // unref so a pending timer never holds the process open on shutdown.
  return setInterval(() => void runDemoReseed(), intervalMs).unref()
}
