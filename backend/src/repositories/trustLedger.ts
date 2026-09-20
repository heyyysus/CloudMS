import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { trustLedger } from "../db/schema"
import { centsToAmount, toCents } from "../money"
import type { TrustLedgerEntry } from "../types"

const withCarrier = { carrier: { columns: { id: true, name: true } } } as const

export async function listTrustLedgerByPolicyId(orgId: string, policyId: string) {
  return db.query.trustLedger.findMany({
    where: and(eq(trustLedger.policyId, policyId), eq(trustLedger.orgId, orgId)),
    orderBy: [desc(trustLedger.createdAt), desc(trustLedger.id)],
    with: withCarrier,
  })
}

export async function listTrustLedgerByClientId(orgId: string, clientId: string) {
  return db.query.trustLedger.findMany({
    where: and(eq(trustLedger.clientId, clientId), eq(trustLedger.orgId, orgId)),
    orderBy: [desc(trustLedger.createdAt), desc(trustLedger.id)],
    with: withCarrier,
  })
}

// Trust balance = money in - money out, over the scoped entries. Reversals are
// ordinary opposite-direction rows, so they net out here automatically.
function balanceOf(entries: Pick<TrustLedgerEntry, "direction" | "amount">[]): string {
  const cents = entries.reduce(
    (acc, e) => acc + (e.direction === "in" ? toCents(e.amount) : -toCents(e.amount)),
    0
  )
  return centsToAmount(cents)
}

export async function getTrustBalanceByPolicyId(orgId: string, policyId: string): Promise<string> {
  const rows = await db
    .select({ direction: trustLedger.direction, amount: trustLedger.amount })
    .from(trustLedger)
    .where(and(eq(trustLedger.policyId, policyId), eq(trustLedger.orgId, orgId)))
  return balanceOf(rows)
}

export async function getTrustBalanceByClientId(orgId: string, clientId: string): Promise<string> {
  const rows = await db
    .select({ direction: trustLedger.direction, amount: trustLedger.amount })
    .from(trustLedger)
    .where(and(eq(trustLedger.clientId, clientId), eq(trustLedger.orgId, orgId)))
  return balanceOf(rows)
}
