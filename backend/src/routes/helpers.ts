import { Response } from "express"
import { z } from "zod"
import { idParam } from "./schemas"

// Parses an :id route param, writing a 400 response and returning undefined
// on failure so callers can `if (id === undefined) return`.
export function parseId(raw: unknown, res: Response): number | undefined {
  const parsed = idParam.safeParse(raw)
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid id" })
    return undefined
  }
  return parsed.data
}

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid request"
}
