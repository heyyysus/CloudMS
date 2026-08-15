// Bodies for the policy_logs rows that accounting actions write automatically.
// Invoices and payments are policy-scoped, and staff read a policy's log as its
// running history, so every create and void appends a line describing what
// happened. These are pure string builders - no DB access - so the wording is
// unit-testable on its own.
//
// The line-item and payment-method wording mirrors the labels the UI shows
// (frontend/src/lib/invoice-options.ts), lowercased because they appear
// mid-sentence here.

import type { InvoiceItemType, InvoiceStatus, PaymentMethod } from "./types"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

function formatUsd(amount: string | number): string {
  return usd.format(Number(amount))
}

const INVOICE_ITEM_TYPE_LABEL: Record<InvoiceItemType, string> = {
  new_business_sweep: "new business sweep",
  new_business_fee: "new business fee",
  installment_payment_sweep: "installment payment sweep",
  installment_payment_fee: "installment payment fee",
  endorsement_sweep: "endorsement sweep",
  endorsement_fee: "endorsement fee",
}

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "cash",
  check: "check",
  credit_card: "credit card",
  debit_card: "debit card",
}

// " Reason: ..." when one was given, nothing when it wasn't. Void reasons are
// free text, so close the sentence unless the reason already punctuated it.
function reasonSuffix(reason: string | null | undefined): string {
  const trimmed = reason?.trim()
  if (!trimmed) return ""
  const terminated = /[.!?]$/.test(trimmed)
  return ` Reason: ${trimmed}${terminated ? "" : "."}`
}

export function invoiceCreatedLogBody(input: {
  invoiceId: number
  total: string
  items: { type: InvoiceItemType; amount: string }[]
}): string {
  const breakdown = input.items
    .map((item) => `${INVOICE_ITEM_TYPE_LABEL[item.type]} ${formatUsd(item.amount)}`)
    .join(", ")
  return `Invoice #${input.invoiceId} created — total ${formatUsd(input.total)} (${breakdown}).`
}

export function paymentRecordedLogBody(input: {
  invoiceId: number
  method: PaymentMethod
  amount: string
  amountApplied: string
  changeGiven: string
  amountDueAfter: string
  invoiceClosed: boolean
}): string {
  const parts = [`${formatUsd(input.amountApplied)} applied`]
  if (Number(input.changeGiven) > 0) {
    parts.push(`${formatUsd(input.changeGiven)} change given`)
  }
  parts.push(
    input.invoiceClosed
      ? "invoice paid in full and closed"
      : `${formatUsd(input.amountDueAfter)} still due`
  )

  const method = PAYMENT_METHOD_LABEL[input.method]
  return `Payment of ${formatUsd(input.amount)} by ${method} on invoice #${input.invoiceId} — ${parts.join(", ")}.`
}

export function invoiceVoidedLogBody(input: {
  invoiceId: number
  total: string
  reason: string | null
}): string {
  return `Invoice #${input.invoiceId} voided — total ${formatUsd(input.total)}.${reasonSuffix(input.reason)}`
}

// `invoiceStatusBefore` is the invoice's status as of just before the void:
// "closed" means this payment had settled it and it reopens, "void" means the
// invoice stays void (voidPayment leaves a void invoice void).
export function paymentVoidedLogBody(input: {
  paymentId: number
  invoiceId: number
  method: PaymentMethod
  amount: string
  amountApplied: string
  amountDueAfter: string
  invoiceStatusBefore: InvoiceStatus
  reason: string | null
}): string {
  const outcome =
    input.invoiceStatusBefore === "void"
      ? "invoice remains void"
      : input.invoiceStatusBefore === "closed"
        ? `invoice reopened with ${formatUsd(input.amountDueAfter)} now due`
        : `${formatUsd(input.amountDueAfter)} now due`

  const method = PAYMENT_METHOD_LABEL[input.method]
  return `Payment #${input.paymentId} of ${formatUsd(input.amount)} by ${method} on invoice #${input.invoiceId} voided — ${formatUsd(input.amountApplied)} reversed, ${outcome}.${reasonSuffix(input.reason)}`
}
