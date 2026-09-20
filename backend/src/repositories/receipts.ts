import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { receipts } from "../db/schema"

const receiptDetailWith = {
  payment: true,
  invoice: { with: { items: { with: { carrier: true } }, client: true } },
  createdByUser: { columns: { id: true, name: true, email: true } },
} as const

export async function getReceiptWithDetails(orgId: string, id: string) {
  return db.query.receipts.findFirst({
    where: and(eq(receipts.id, id), eq(receipts.orgId, orgId)),
    with: receiptDetailWith,
  })
}

export async function listReceiptsByPolicyId(orgId: string, policyId: string) {
  return db.query.receipts.findMany({
    where: and(eq(receipts.policyId, policyId), eq(receipts.orgId, orgId)),
    orderBy: [desc(receipts.createdAt), desc(receipts.id)],
    with: { payment: true },
  })
}

export async function listReceiptsByClientId(orgId: string, clientId: string) {
  return db.query.receipts.findMany({
    where: and(eq(receipts.clientId, clientId), eq(receipts.orgId, orgId)),
    orderBy: [desc(receipts.createdAt), desc(receipts.id)],
    with: { payment: true },
  })
}
