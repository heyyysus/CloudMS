import { and, desc, eq, isNull } from "drizzle-orm"
import { invoiceCreatedLogBody, invoiceVoidedLogBody } from "../accountingLogs"
import { db } from "../db"
import { autoPolicies, carriers, invoiceItems, invoices, payments } from "../db/schema"
import { sumAmounts } from "../money"
import type { InvoiceItemCategory, InvoiceItemType } from "../types"
import { CrossOrgReferenceError } from "./errors"
import { allocateInvoiceNumberInTx } from "./organizations"
import { insertPolicyLogInTx, withLogNumberRetry } from "./policyLogs"

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
  carrierId?: string | null
  description?: string | null
  amount: string
}

export interface CreateInvoiceInput {
  policyId: string
  createdBy: string
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

export async function getInvoiceWithDetails(orgId: string, id: string) {
  return db.query.invoices.findFirst({
    where: and(eq(invoices.id, id), eq(invoices.orgId, orgId)),
    with: invoiceDetailWith,
  })
}

export async function listInvoicesByPolicyId(orgId: string, policyId: string) {
  return db.query.invoices.findMany({
    where: and(eq(invoices.policyId, policyId), eq(invoices.orgId, orgId)),
    orderBy: [desc(invoices.createdAt), desc(invoices.id)],
    with: { items: { with: { carrier: true } } },
  })
}

export async function listInvoicesByClientId(orgId: string, clientId: string) {
  return db.query.invoices.findMany({
    where: and(eq(invoices.clientId, clientId), eq(invoices.orgId, orgId)),
    orderBy: [desc(invoices.createdAt), desc(invoices.id)],
    with: { items: { with: { carrier: true } } },
  })
}

// Creates an invoice plus its line items in one transaction, and appends the
// policy log recording it. Sweep items default their carrier to the policy's
// carrier when none is given; agency-fee items never carry a carrier. An
// explicit carrierId on an item must belong to orgId - a cross-org id throws
// CrossOrgReferenceError, which app.ts maps to 409. Returns undefined when the
// policy doesn't exist. The invoice opens with amountPaid 0 and status "open".
//
// `logId` comes back alongside the invoice so the route can attach the invoice
// PDF - generated after this commits - to the very log written here.
export async function createInvoiceWithDetails(orgId: string, input: CreateInvoiceInput) {
  if (input.items.length === 0) {
    throw new InvoiceWriteError("An invoice needs at least one item")
  }

  const created = await withLogNumberRetry(async () =>
    db.transaction(async (tx) => {
      const [policy] = await tx
        .select({
          id: autoPolicies.id,
          clientId: autoPolicies.clientId,
          carrierId: autoPolicies.carrierId,
        })
        .from(autoPolicies)
        .where(and(eq(autoPolicies.id, input.policyId), eq(autoPolicies.orgId, orgId)))
      if (!policy) return undefined

      const resolvedItems = []
      for (const item of input.items) {
        const isSweep = SWEEP_TYPES.has(item.type)
        if (isSweep) {
          const carrierId = item.carrierId ?? policy.carrierId
          if (!carrierId) {
            throw new InvoiceWriteError("A sweep item needs a carrier")
          }
          if (item.carrierId) {
            const [carrier] = await tx
              .select({ id: carriers.id })
              .from(carriers)
              .where(and(eq(carriers.id, item.carrierId), eq(carriers.orgId, orgId)))
            if (!carrier) throw new CrossOrgReferenceError()
          }
          resolvedItems.push({
            category: "sweep" as const,
            type: item.type,
            carrierId,
            description: item.description ?? null,
            amount: item.amount,
          })
        } else {
          resolvedItems.push({
            category: "agency" as const,
            type: item.type,
            carrierId: null,
            description: item.description ?? null,
            amount: item.amount,
          })
        }
      }

      const total = sumAmounts(resolvedItems.map((i) => i.amount))

      // Allocated as late as correctness allows, since the UPDATE it runs
      // holds a row lock on the organization for the rest of the transaction.
      const invoiceNumber = await allocateInvoiceNumberInTx(tx, orgId)

      const [invoice] = await tx
        .insert(invoices)
        .values({
          orgId,
          invoiceNumber,
          policyId: input.policyId,
          clientId: policy.clientId,
          createdBy: input.createdBy,
          total,
          note: input.note ?? null,
        })
        .returning({ id: invoices.id })

      await tx
        .insert(invoiceItems)
        .values(resolvedItems.map((item) => ({ ...item, orgId, invoiceId: invoice.id })))

      const logId = await insertPolicyLogInTx(tx, orgId, {
        policyId: input.policyId,
        authorId: input.createdBy,
        body: invoiceCreatedLogBody({ invoiceNumber, total, items: resolvedItems }),
      })

      return { invoiceId: invoice.id, logId }
    })
  )

  if (created === undefined) return undefined
  const invoice = await getInvoiceWithDetails(orgId, created.invoiceId)
  return invoice && { invoice, logId: created.logId }
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
  orgId: string,
  id: string,
  voidedBy: string,
  reason: string | null
): Promise<VoidInvoiceResult> {
  return withLogNumberRetry(async () =>
    db.transaction(async (tx): Promise<VoidInvoiceResult> => {
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.id, id), eq(invoices.orgId, orgId)))
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

      await insertPolicyLogInTx(tx, orgId, {
        policyId: invoice.policyId,
        authorId: voidedBy,
        body: invoiceVoidedLogBody({
          invoiceNumber: invoice.invoiceNumber,
          total: invoice.total,
          reason,
        }),
      })

      return { status: "ok" }
    })
  )
}
