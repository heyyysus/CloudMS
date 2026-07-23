import { request } from './client'
import type { PaymentMethod } from './invoices'

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
