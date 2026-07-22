import { desc, eq } from "drizzle-orm"
import { db } from "../db"
import { receipts } from "../db/schema"

const receiptDetailWith = {
  payment: true,
  invoice: { with: { items: { with: { carrier: true } }, client: true } },
  createdByUser: { columns: { id: true, name: true, email: true } },
} as const

export async function getReceiptWithDetails(id: number) {
  return db.query.receipts.findFirst({ where: eq(receipts.id, id), with: receiptDetailWith })
}

export async function listReceiptsByPolicyId(policyId: number) {
  return db.query.receipts.findMany({
    where: eq(receipts.policyId, policyId),
    orderBy: desc(receipts.id),
    with: { payment: true },
  })
}

export async function listReceiptsByClientId(clientId: number) {
  return db.query.receipts.findMany({
    where: eq(receipts.clientId, clientId),
    orderBy: desc(receipts.id),
    with: { payment: true },
  })
}
