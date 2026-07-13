import cookieParser from "cookie-parser"
import express, { Application, Request, Response } from "express"
import pinoHttp from "pino-http"
import { authRouter } from "./auth/routes"
import { logger } from "./logger"

const app: Application = express()

app.use(pinoHttp({ logger }))
app.use(express.json())
app.use(cookieParser())

app.use(authRouter)

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

export default app
