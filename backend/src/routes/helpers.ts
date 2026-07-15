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

interface PgError {
  code: string
  constraint?: string
}

// Drizzle wraps driver errors in DrizzleQueryError with the pg error on
// `cause`, so walk the cause chain looking for a SQLSTATE code.
function findPgError(err: unknown): PgError | undefined {
  let current = err
  while (typeof current === "object" && current !== null) {
    if (typeof (current as PgError).code === "string") return current as PgError
    current = (current as { cause?: unknown }).cause
  }
  return undefined
}

// Unique violation (SQLSTATE 23505); `constraint` narrows to a specific index.
export function isPgUniqueViolation(err: unknown, constraint?: string): boolean {
  const pgError = findPgError(err)
  if (!pgError || pgError.code !== "23505") return false
  return constraint === undefined || pgError.constraint === constraint
}

// Foreign key violation (SQLSTATE 23503).
export function isPgForeignKeyViolation(err: unknown): boolean {
  return findPgError(err)?.code === "23503"
}
