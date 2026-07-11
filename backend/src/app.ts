import express, { Application, Request, Response } from "express"
import pinoHttp from "pino-http"
import { logger } from "./logger"

const app: Application = express()

app.use(pinoHttp({ logger }))
app.use(express.json())

app.get("/health", (req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() })
})

export default app
