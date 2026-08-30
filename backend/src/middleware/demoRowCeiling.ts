import { sql } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { NextFunction, Request, Response } from "express"
import { demoMaxRowsPerTable, demoMode } from "../config"
import { db } from "../db"

// Demo-mode-only guardrail: once a table holds demoMaxRowsPerTable() rows,
// its create route refuses new ones until the next reseed. No-op (and no
// query) outside demo mode, so production pays nothing.
export function demoRowCeiling(table: PgTable) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!demoMode()) return next()

    const [row] = await db.select({ count: sql<number>`count(*)` }).from(table)
    if (Number(row.count) >= demoMaxRowsPerTable()) {
      res.status(429).json({ error: "Demo row limit reached; data resets on the next reseed." })
      return
    }
    next()
  }
}
