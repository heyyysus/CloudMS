import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, policyLogs } from "../db/schema"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

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
  id: string
  policyId: string
  logNumber: number
  body: string
  createdAt: Date
  author: { id: string; name: string | null; email: string }
}

export async function listPolicyLogsByPolicyId(
  orgId: string,
  policyId: string
): Promise<PolicyLogWithAuthor[]> {
  return db.query.policyLogs.findMany({
    where: and(eq(policyLogs.policyId, policyId), eq(policyLogs.orgId, orgId)),
    orderBy: desc(policyLogs.logNumber),
    with: { author: { columns: { id: true, name: true, email: true } } },
  })
}

// Runs `fn` (a whole transaction) again when it aborted on the log-number
// race, since a unique violation poisons the surrounding Postgres transaction
// and can't be retried from the inside. Callers that write a log as part of a
// larger transaction wrap that transaction in this; retrying is safe because a
// failed attempt rolled back whole. Every other error propagates untouched -
// notably InvoiceWriteError, which the routes layer maps to a 400.
export async function withLogNumberRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (isLogNumberRaceViolation(err)) continue
      throw err
    }
  }
  throw new Error("Could not assign a policy log number after retrying")
}

// Inserts one log on the caller's transaction, assigning logNumber as
// max(logNumber)+1 for the policy. Assumes the policy exists - callers writing
// a log alongside another policy-scoped write have already resolved it. The
// (policyId, logNumber) unique constraint guards the race between two
// concurrent inserts computing the same next number; recovering from that is
// the surrounding withLogNumberRetry's job.
export async function insertPolicyLogInTx(
  tx: Tx,
  orgId: string,
  input: { policyId: string; authorId: string; body: string }
): Promise<string> {
  const [{ nextNumber }] = await tx
    .select({
      nextNumber: sql<number>`coalesce(max(${policyLogs.logNumber}), 0) + 1`,
    })
    .from(policyLogs)
    .where(and(eq(policyLogs.policyId, input.policyId), eq(policyLogs.orgId, orgId)))

  const [row] = await tx
    .insert(policyLogs)
    .values({
      orgId,
      policyId: input.policyId,
      authorId: input.authorId,
      body: input.body,
      logNumber: nextNumber,
    })
    .returning({ id: policyLogs.id })

  return row.id
}

// Creates a standalone log (the POST /policy-logs path). Returns undefined
// when the policy doesn't exist.
export async function createPolicyLog(
  orgId: string,
  input: {
    policyId: string
    authorId: string
    body: string
  }
): Promise<PolicyLogWithAuthor | undefined> {
  const id = await withLogNumberRetry(async () =>
    db.transaction(async (tx) => {
      const [policy] = await tx
        .select({ id: autoPolicies.id })
        .from(autoPolicies)
        .where(and(eq(autoPolicies.id, input.policyId), eq(autoPolicies.orgId, orgId)))
      if (!policy) return undefined

      return insertPolicyLogInTx(tx, orgId, input)
    })
  )

  if (id === undefined) return undefined

  return db.query.policyLogs.findFirst({
    where: eq(policyLogs.id, id),
    with: { author: { columns: { id: true, name: true, email: true } } },
  })
}
