import cookieParser from "cookie-parser"
import express, { Application, NextFunction, Request, Response } from "express"
import pinoHttp from "pino-http"
import { authRouter } from "./auth/routes"
import { logger } from "./logger"
import { carriersRouter } from "./routes/carriers"
import { clientsRouter } from "./routes/clients"
import { correspondenceTemplatesRouter } from "./routes/correspondenceTemplates"
import { emailTemplatesRouter } from "./routes/emailTemplates"
import { invoicesRouter } from "./routes/invoices"
import { mailRouter } from "./routes/mail"
import { paymentsRouter } from "./routes/payments"
import { personsRouter } from "./routes/persons"
import { policiesRouter } from "./routes/policies"
import { policyAttachmentsRouter } from "./routes/policyAttachments"
import { policyLogAttachmentsRouter } from "./routes/policyLogAttachments"
import { policyActivitiesRouter } from "./routes/policyActivities"
import { policyLogsRouter } from "./routes/policyLogs"
import { receiptsRouter } from "./routes/receipts"
import { reminderRulesRouter } from "./routes/reminderRules"
import { searchRouter } from "./routes/search"
import { trustLedgerRouter } from "./routes/trustLedger"
import { usersRouter } from "./routes/users"
import { vehiclesRouter } from "./routes/vehicles"
import { vinDecoderRouter } from "./routes/vinDecoder"

const app: Application = express()

// API responses must never be cached by the browser (or Cloudflare):
// stale reads after a mutation are worse than the re-fetch cost. Disabling
// etag also stops Express from generating validators that would let
// browsers hold 304-revalidated copies.
app.set("etag", false)
app.use((req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store")
  next()
})

app.use(pinoHttp({ logger }))
app.use(express.json())
app.use(cookieParser())

app.use(authRouter)
app.use(personsRouter)
app.use(clientsRouter)
app.use(policiesRouter)
app.use(policyLogsRouter)
app.use(policyAttachmentsRouter)
app.use(policyLogAttachmentsRouter)
app.use(vehiclesRouter)
app.use(carriersRouter)
app.use(invoicesRouter)
app.use(paymentsRouter)
app.use(receiptsRouter)
app.use(mailRouter)
app.use(trustLedgerRouter)
app.use(searchRouter)
app.use(vinDecoderRouter)
app.use(usersRouter)
app.use(emailTemplatesRouter)
app.use(correspondenceTemplatesRouter)
app.use(reminderRulesRouter)
app.use(policyActivitiesRouter)

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

// Postgres unique/FK violations surface here since Express 5 forwards
// rejected async handlers automatically; without this they'd be HTML 500s.
// drizzle-orm wraps the raw pg error in a DrizzleQueryError, so the pg error
// code lives on `err.cause`, not on `err` itself.
interface PgError extends Error {
  code?: string
  cause?: { code?: string }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: PgError, req: Request, res: Response, next: NextFunction) => {
  const code = err.code ?? err.cause?.code
  if (code === "23505") {
    res.status(409).json({ error: "Duplicate value" })
    return
  }
  if (code === "23503") {
    res.status(409).json({ error: "Referenced by or references other records" })
    return
  }
  // Raised when a text field carries a NUL byte or other invalid UTF-8 -
  // Postgres can't store it, and this is a bad request, not a server fault.
  if (code === "22021") {
    res.status(400).json({ error: "Invalid characters in request" })
    return
  }
  req.log.error(err)
  res.status(500).json({ error: "Internal server error" })
})

export default app
