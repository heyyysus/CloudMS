import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, invoiceItems, invoices, payments } from "../db/schema"
import { sumAmounts } from "../money"
import type { InvoiceItemCategory, InvoiceItemType } from "../types"

// Validation failures raised inside the create transaction that the route
// should surface as a 400 rather than a 500.
export class InvoiceWriteError extends Error {}

const SWEEP_TYPES = new Set<InvoiceItemType>([
  "new_business_sweep",
  "installment_payment_sweep",
  "endorsement_sweep",
])

export interface CreateInvoiceItemInput {
  category: InvoiceItemCategory
  type: InvoiceItemType
  carrierId?: number | null
  description?: string | null
  amount: string
}

export interface CreateInvoiceInput {
  policyId: number
  createdBy: number
  note?: string | null
  items: CreateInvoiceItemInput[]
}

const invoiceDetailWith = {
  items: { with: { carrier: true } },
  payments: true,
  receipts: true,
  client: true,
  createdByUser: { columns: { id: true, name: true, email: true } },
} as const

export async function getInvoiceWithDetails(id: number) {
  return db.query.invoices.findFirst({
    where: eq(invoices.id, id),
    with: invoiceDetailWith,
  })
}

export async function listInvoicesByPolicyId(policyId: number) {
  return db.query.invoices.findMany({
    where: eq(invoices.policyId, policyId),
    orderBy: desc(invoices.id),
    with: { items: { with: { carrier: true } } },
  })
}

export async function listInvoicesByClientId(clientId: number) {
  return db.query.invoices.findMany({
    where: eq(invoices.clientId, clientId),
    orderBy: desc(invoices.id),
    with: { items: { with: { carrier: true } } },
  })
}

// Creates an invoice plus its line items in one transaction. Sweep items
// default their carrier to the policy's carrier when none is given; agency-fee
// items never carry a carrier. Returns undefined when the policy doesn't
// exist. The invoice opens with amountPaid 0 and status "open".
export async function createInvoiceWithDetails(input: CreateInvoiceInput) {
  if (input.items.length === 0) {
    throw new InvoiceWriteError("An invoice needs at least one item")
  }

  const id = await db.transaction(async (tx) => {
    const [policy] = await tx
      .select({
        id: autoPolicies.id,
        clientId: autoPolicies.clientId,
        carrierId: autoPolicies.carrierId,
      })
      .from(autoPolicies)
      .where(eq(autoPolicies.id, input.policyId))
    if (!policy) return undefined

    const resolvedItems = input.items.map((item) => {
      const isSweep = SWEEP_TYPES.has(item.type)
      if (isSweep) {
        const carrierId = item.carrierId ?? policy.carrierId
        if (!carrierId) {
          throw new InvoiceWriteError("A sweep item needs a carrier")
        }
        return {
          category: "sweep" as const,
          type: item.type,
          carrierId,
          description: item.description ?? null,
          amount: item.amount,
        }
      }
      return {
        category: "agency" as const,
        type: item.type,
        carrierId: null,
        description: item.description ?? null,
        amount: item.amount,
      }
    })

    const total = sumAmounts(resolvedItems.map((i) => i.amount))

    const [invoice] = await tx
      .insert(invoices)
      .values({
        policyId: input.policyId,
        clientId: policy.clientId,
        createdBy: input.createdBy,
        total,
        note: input.note ?? null,
      })
      .returning({ id: invoices.id })

    await tx
      .insert(invoiceItems)
      .values(resolvedItems.map((item) => ({ ...item, invoiceId: invoice.id })))

    return invoice.id
  })

  if (id === undefined) return undefined
  return getInvoiceWithDetails(id)
}

export type VoidInvoiceResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "already_void" }
  | { status: "has_active_payments" }

// Voids an invoice created in error. Only allowed while it has no active
// (non-voided) payments - void those first, since they carry money movements
// that must be reversed individually. An unpaid invoice has no trust-ledger
// entries, so voiding just flips its status.
export async function voidInvoice(
  id: number,
  voidedBy: number,
  reason: string | null
): Promise<VoidInvoiceResult> {
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id))
    if (!invoice) return { status: "not_found" }
    if (invoice.status === "void") return { status: "already_void" }

    const activePayments = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.invoiceId, id), isNull(payments.voidedAt)))
    if (activePayments.length > 0) return { status: "has_active_payments" }

    await tx
      .update(invoices)
      .set({
        status: "void",
        voidedAt: new Date(),
        voidedBy,
        voidReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, id))

    return { status: "ok" }
  })
}
