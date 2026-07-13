import app from "./app"
import { logger } from "./logger"

// Without an audience, google-auth-library skips the aud check entirely and
// any Google-issued ID token would be accepted — refuse to start instead.
if (!process.env.GOOGLE_CLIENT_ID) {
  logger.fatal("GOOGLE_CLIENT_ID is not set — refusing to start")
  process.exit(1)
}

const PORT = process.env.PORT || 8000

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
})
