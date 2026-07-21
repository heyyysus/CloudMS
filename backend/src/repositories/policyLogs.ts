import { desc, eq, sql } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, policyLogs } from "../db/schema"

// Drizzle wraps driver errors in DrizzleQueryError with the pg error on
// `cause`, so walk the cause chain looking for the log-number race's
// SQLSTATE (23505 = unique violation) and constraint name. Duplicated from
// routes/helpers.ts rather than imported, since repositories don't depend on
// the routes layer.
function isLogNumberRaceViolation(err: unknown): boolean {
  let current = err
  while (typeof current === "object" && current !== null) {
    const code = (current as { code?: string }).code
    const constraint = (current as { constraint?: string }).constraint
    if (typeof code === "string") {
      return code === "23505" && constraint === "policy_logs_policy_id_log_number_unique"
    }
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export interface PolicyLogWithAuthor {
  id: number
  policyId: number
  logNumber: number
  body: string
  createdAt: Date
  author: { id: number; name: string | null; email: string }
}

export async function listPolicyLogsByPolicyId(policyId: number): Promise<PolicyLogWithAuthor[]> {
  return db.query.policyLogs.findMany({
    where: eq(policyLogs.policyId, policyId),
    orderBy: desc(policyLogs.logNumber),
    with: { author: { columns: { id: true, name: true, email: true } } },
  })
}

// logNumber is a per-policy counter (1, 2, 3, ...), computed as
// max(logNumber)+1 for the policy inside the same transaction as the insert.
// The (policyId, logNumber) unique constraint guards the race between two
// concurrent inserts computing the same next number; on that specific
// violation, retry once with a freshly computed number.
export async function createPolicyLog(input: {
  policyId: number
  authorId: number
  body: string
}): Promise<PolicyLogWithAuthor | undefined> {
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const id = await db.transaction(async (tx) => {
        const [policy] = await tx
          .select({ id: autoPolicies.id })
          .from(autoPolicies)
          .where(eq(autoPolicies.id, input.policyId))
        if (!policy) return undefined

        const [{ nextNumber }] = await tx
          .select({
            nextNumber: sql<number>`coalesce(max(${policyLogs.logNumber}), 0) + 1`,
          })
          .from(policyLogs)
          .where(eq(policyLogs.policyId, input.policyId))

        const [row] = await tx
          .insert(policyLogs)
          .values({
            policyId: input.policyId,
            authorId: input.authorId,
            body: input.body,
            logNumber: nextNumber,
          })
          .returning({ id: policyLogs.id })
        return row.id
      })

      if (id === undefined) return undefined

      return db.query.policyLogs.findFirst({
        where: eq(policyLogs.id, id),
        with: { author: { columns: { id: true, name: true, email: true } } },
      })
    } catch (err) {
      if (isLogNumberRaceViolation(err)) continue
      throw err
    }
  }
  throw new Error(`Could not assign a log number for policy ${input.policyId} after retrying`)
}
