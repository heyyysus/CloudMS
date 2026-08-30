import { request } from './client'
import type { InvoicePayment, PaymentMethod } from './invoices'

export interface Payment {
  id: number
  invoiceId: number
  policyId: number
  clientId: number
  method: PaymentMethod
  amount: string
  amountApplied: string
  changeGiven: string
  note: string | null
  createdAt: string
}

export interface RecordPaymentBody {
  invoiceId: number
  method: PaymentMethod
  amount: string
  note?: string | null
  receiptNote?: string | null
}

// POST /payments returns the minted receipt, not the payment.
export interface ReceiptDetail {
  id: number
  paymentId: number
  invoiceId: number
  policyId: number
  clientId: number
  amountApplied: string
  changeGiven: string
  amountDueAfter: string
  invoiceClosed: boolean
  note: string | null
  createdAt: string
  payment: Payment
}

export function recordPayment(body: RecordPaymentBody): Promise<ReceiptDetail> {
  return request('/payments', { method: 'POST', body: JSON.stringify(body) })
}

export interface VoidPaymentBody {
  reason?: string | null
}

// Payments are immutable too: a mistaken one is voided, which reverses its
// trust-ledger movements, reopens the invoice, and voids the receipt. Voiding
// an invoice's payments is the prerequisite for voiding the invoice itself.
//
// The response nests the payment's receipt, invoice, and creator, but callers
// here only need the payment columns - and since it describes the *payment*
// rather than the invoice, an invoice detail already in cache has to be
// refetched after this rather than patched from the response.
export function voidPayment(id: number, body: VoidPaymentBody = {}): Promise<InvoicePayment> {
  return request(`/payments/${id}/void`, { method: 'POST', body: JSON.stringify(body) })
}

export function getPaymentsByPolicy(policyId: number, signal?: AbortSignal): Promise<InvoicePayment[]> {
  return request(`/payments?policyId=${policyId}`, { signal })
}
