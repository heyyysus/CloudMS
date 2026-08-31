import app from "./app"
import { demoMode } from "./config"
import { startDemoReseedScheduler } from "./jobs/demoReseed"
import { startReminderScheduler } from "./jobs/scheduler"
import { logger } from "./logger"

// Without an audience, google-auth-library skips the aud check entirely and
// any Google-issued ID token would be accepted — refuse to start instead.
if (!process.env.GOOGLE_CLIENT_ID) {
  logger.fatal("GOOGLE_CLIENT_ID is not set — refusing to start")
  process.exit(1)
}

// Not gated on NODE_ENV: a demo deployment is itself a production deployment,
// so this is a real warning, not a dev-only notice.
if (demoMode()) {
  logger.warn("demo mode: /auth/demo is open and mints admin accounts")
}

const PORT = process.env.PORT || 8000

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
  // Started here rather than in app.ts so importing the app for a test never
  // starts a timer. Safe to run on every container: the planner takes an
  // advisory lock and the dispatcher claims rows with SKIP LOCKED.
  startReminderScheduler()
  startDemoReseedScheduler()
})
