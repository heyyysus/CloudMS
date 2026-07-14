import cookieParser from "cookie-parser"
import express, { Application, NextFunction, Request, Response } from "express"
import pinoHttp from "pino-http"
import { authRouter } from "./auth/routes"
import { logger } from "./logger"
import { carriersRouter } from "./routes/carriers"
import { clientsRouter } from "./routes/clients"
import { personsRouter } from "./routes/persons"
import { policiesRouter } from "./routes/policies"
import { searchRouter } from "./routes/search"
import { vehiclesRouter } from "./routes/vehicles"

const app: Application = express()

app.use(pinoHttp({ logger }))
app.use(express.json())
app.use(cookieParser())

app.use(authRouter)
app.use(personsRouter)
app.use(clientsRouter)
app.use(policiesRouter)
app.use(vehiclesRouter)
app.use(carriersRouter)
app.use(searchRouter)

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
  req.log.error(err)
  res.status(500).json({ error: "Internal server error" })
})

export default app
