// Display wording for the accounting enums, mirroring the labels the UI shows
// (frontend/src/lib/invoice-options.ts). Sentence-case here; accountingLogs.ts
// lowercases them for use mid-sentence, and accountingDocuments.ts prints them
// as-is on invoices and receipts.

import type { InvoiceItemType, InvoiceStatus, PaymentMethod } from "./types"

export const INVOICE_ITEM_TYPE_LABEL: Record<InvoiceItemType, string> = {
  new_business_sweep: "New business sweep",
  new_business_fee: "New business fee",
  installment_payment_sweep: "Installment payment sweep",
  installment_payment_fee: "Installment payment fee",
  endorsement_sweep: "Endorsement sweep",
  endorsement_fee: "Endorsement fee",
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  check: "Check",
  credit_card: "Credit card",
  debit_card: "Debit card",
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: "Open",
  closed: "Closed",
  void: "Void",
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })

export function formatUsd(amount: string | number): string {
  return usd.format(Number(amount))
}
