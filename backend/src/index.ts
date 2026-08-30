import app from "./app"
import { demoMode, forbiddenDemoEnvPresent } from "./demo"
import { startReminderScheduler } from "./jobs/scheduler"
import { logger } from "./logger"

// Without an audience, google-auth-library skips the aud check entirely and
// any Google-issued ID token would be accepted — refuse to start instead.
if (!process.env.GOOGLE_CLIENT_ID) {
  logger.fatal("GOOGLE_CLIENT_ID is not set — refusing to start")
  process.exit(1)
}

// A demo instance may not hold outbound credentials at all, so refuse to
// start rather than run with them present and unused.
if (demoMode()) {
  const present = forbiddenDemoEnvPresent()
  if (present.length > 0) {
    logger.fatal(`DEMO_MODE is set but ${present.join(", ")} is configured — refusing to start`)
    process.exit(1)
  }
}

const PORT = process.env.PORT || 8000

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
  // Started here rather than in app.ts so importing the app for a test never
  // starts a timer. Safe to run on every container: the planner takes an
  // advisory lock and the dispatcher claims rows with SKIP LOCKED.
  startReminderScheduler()
})
