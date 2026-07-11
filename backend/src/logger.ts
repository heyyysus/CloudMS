import pino from "pino"

const level = process.env.LOG_LEVEL || "info"

export const logger = pino({
  level: process.env.NODE_ENV === "test" ? "silent" : level,
  transport: process.env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
})
