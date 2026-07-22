import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { invoiceItems, invoices, payments, receipts, trustLedger } from "../db/schema"
import { centsToAmount, toCents } from "../money"
import type { PaymentMethod } from "../types"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface RecordPaymentInput {
  invoiceId: number
  method: PaymentMethod
  amount: string
  note?: string | null
  receiptNote?: string | null
  createdBy: number
}

export type RecordPaymentResult =
  | { status: "ok"; receiptId: number }
  | { status: "invoice_not_found" }
  | { status: "invoice_not_open" }

// On full payment the carrier's share leaves the trust account (a
// "carrier_sweep" per sweep item) and the agency keeps its fee (an
// "agency_fee" per agency item). Posted once, when the invoice closes.
async function postSweepAndFeeEntries(tx: Tx, invoiceId: number): Promise<void> {
  const [invoice] = await tx
    .select({ policyId: invoices.policyId, clientId: invoices.clientId })
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
  const items = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId))

  for (const item of items) {
    await tx.insert(trustLedger).values({
      policyId: invoice.policyId,
      clientId: invoice.clientId,
      invoiceId,
      invoiceItemId: item.id,
      carrierId: item.category === "sweep" ? item.carrierId : null,
      entryType: item.category === "sweep" ? "carrier_sweep" : "agency_fee",
      direction: "out",
      amount: item.amount,
    })
  }
}

// Records a client payment against an open invoice: applies as much as is owed
// (the remainder is change handed back, never held in trust), mints a receipt,
// posts the money into the trust account, and - if this payment settles the
// invoice - closes it and sweeps the carrier/agency shares back out.
export async function recordPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, input.invoiceId))
    if (!invoice) return { status: "invoice_not_found" }
    if (invoice.status !== "open") return { status: "invoice_not_open" }

    const totalC = toCents(invoice.total)
    const paidC = toCents(invoice.amountPaid)
    const dueC = totalC - paidC
    const amountC = toCents(input.amount)
    const appliedC = Math.min(amountC, dueC)
    const changeC = amountC - appliedC
    const newPaidC = paidC + appliedC
    const closed = totalC - newPaidC <= 0

    const [payment] = await tx
      .insert(payments)
      .values({
        invoiceId: invoice.id,
        policyId: invoice.policyId,
        clientId: invoice.clientId,
        method: input.method,
        amount: input.amount,
        amountApplied: centsToAmount(appliedC),
        changeGiven: centsToAmount(changeC),
        note: input.note ?? null,
        createdBy: input.createdBy,
      })
      .returning({ id: payments.id })

    // Money into the trust account = the applied portion (change never lands
    // in trust).
    if (appliedC > 0) {
      await tx.insert(trustLedger).values({
        policyId: invoice.policyId,
        clientId: invoice.clientId,
        invoiceId: invoice.id,
        paymentId: payment.id,
        entryType: "payment_received",
        direction: "in",
        amount: centsToAmount(appliedC),
      })
    }

    const [receipt] = await tx
      .insert(receipts)
      .values({
        paymentId: payment.id,
        invoiceId: invoice.id,
        policyId: invoice.policyId,
        clientId: invoice.clientId,
        createdBy: input.createdBy,
        amountApplied: centsToAmount(appliedC),
        changeGiven: centsToAmount(changeC),
        amountDueAfter: centsToAmount(Math.max(totalC - newPaidC, 0)),
        invoiceClosed: closed,
        note: input.receiptNote ?? null,
      })
      .returning({ id: receipts.id })

    await tx
      .update(invoices)
      .set({
        amountPaid: centsToAmount(newPaidC),
        status: closed ? "closed" : "open",
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id))

    if (closed) {
      await postSweepAndFeeEntries(tx, invoice.id)
    }

    return { status: "ok", receiptId: receipt.id }
  })
}

// Reverses the sweep/agency "out" entries currently active for an invoice
// (those not already reversed) by inserting mirror "in" entries. Called when a
// void reopens a previously-closed invoice, since the carrier/agency shares
// couldn't have been swept if the money wasn't fully collected.
async function reverseSweepAndFeeEntries(
  tx: Tx,
  invoiceId: number,
  note: string | null
): Promise<void> {
  const entries = await tx.select().from(trustLedger).where(eq(trustLedger.invoiceId, invoiceId))
  const reversedIds = new Set(
    entries.filter((e) => e.reversalOfId !== null).map((e) => e.reversalOfId)
  )
  const active = entries.filter(
    (e) =>
      e.direction === "out" &&
      (e.entryType === "carrier_sweep" || e.entryType === "agency_fee") &&
      !reversedIds.has(e.id)
  )

  for (const entry of active) {
    await tx.insert(trustLedger).values({
      policyId: entry.policyId,
      clientId: entry.clientId,
      invoiceId,
      invoiceItemId: entry.invoiceItemId,
      carrierId: entry.carrierId,
      entryType: entry.entryType,
      direction: "in",
      amount: entry.amount,
      reversalOfId: entry.id,
      note: note ?? "Reversed on payment void",
    })
  }
}

export type VoidPaymentResult =
  { status: "ok" } | { status: "not_found" } | { status: "already_void" }

// Voids a payment: reverses the money it put into the trust account, voids its
// receipt, and reopens the invoice if this payment had closed it (reversing
// the sweep/fee entries too). The payment and receipt rows are kept for the
// audit trail, stamped with voidedAt.
export async function voidPayment(
  paymentId: number,
  voidedBy: number,
  reason: string | null
): Promise<VoidPaymentResult> {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(eq(payments.id, paymentId))
    if (!payment) return { status: "not_found" }
    if (payment.voidedAt) return { status: "already_void" }

    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, payment.invoiceId))

    const appliedC = toCents(payment.amountApplied)
    if (appliedC > 0) {
      const [originalIn] = await tx
        .select({ id: trustLedger.id })
        .from(trustLedger)
        .where(
          and(
            eq(trustLedger.paymentId, payment.id),
            eq(trustLedger.entryType, "payment_received"),
            eq(trustLedger.direction, "in")
          )
        )
      await tx.insert(trustLedger).values({
        policyId: payment.policyId,
        clientId: payment.clientId,
        invoiceId: payment.invoiceId,
        paymentId: payment.id,
        entryType: "payment_received",
        direction: "out",
        amount: payment.amountApplied,
        reversalOfId: originalIn?.id ?? null,
        note: reason ?? "Payment voided",
      })
    }

    if (invoice.status === "closed") {
      await reverseSweepAndFeeEntries(tx, invoice.id, reason)
    }

    const newPaidC = Math.max(toCents(invoice.amountPaid) - appliedC, 0)
    await tx
      .update(invoices)
      .set({
        amountPaid: centsToAmount(newPaidC),
        // Voiding an applied payment always drops the invoice below its total,
        // so a closed invoice reopens. A void invoice stays void.
        status: invoice.status === "void" ? "void" : "open",
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoice.id))

    await tx
      .update(receipts)
      .set({ voidedAt: new Date(), voidedBy, voidReason: reason })
      .where(eq(receipts.paymentId, payment.id))

    await tx
      .update(payments)
      .set({ voidedAt: new Date(), voidedBy, voidReason: reason })
      .where(eq(payments.id, payment.id))

    return { status: "ok" }
  })
}

const paymentDetailWith = {
  receipt: true,
  invoice: { with: { items: { with: { carrier: true } } } },
  createdByUser: { columns: { id: true, name: true, email: true } },
} as const

export async function getPaymentWithDetails(id: number) {
  return db.query.payments.findFirst({ where: eq(payments.id, id), with: paymentDetailWith })
}

export async function listPaymentsByPolicyId(policyId: number) {
  return db.query.payments.findMany({
    where: eq(payments.policyId, policyId),
    orderBy: desc(payments.id),
    with: { receipt: true },
  })
}

export async function listPaymentsByClientId(clientId: number) {
  return db.query.payments.findMany({
    where: eq(payments.clientId, clientId),
    orderBy: desc(payments.id),
    with: { receipt: true },
  })
}
