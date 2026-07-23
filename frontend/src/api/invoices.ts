import { request } from './client'
import type { Carrier } from './policies'
import { toCents } from '@/lib/money'

export type InvoiceStatus = 'open' | 'closed' | 'void'
export type InvoiceItemCategory = 'sweep' | 'agency'
export type InvoiceItemType =
  | 'new_business_sweep'
  | 'installment_payment_sweep'
  | 'endorsement_sweep'
  | 'new_business_fee'
  | 'installment_payment_fee'
  | 'endorsement_fee'
export type PaymentMethod = 'cash' | 'check' | 'credit_card' | 'debit_card'

export interface InvoiceItem {
  id: number
  invoiceId: number
  category: InvoiceItemCategory
  type: InvoiceItemType
  carrierId: number | null
  description: string | null
  amount: string
  createdAt: string
  carrier: Carrier | null
}

// List-row shape (GET /invoices?clientId=): items with carrier, but no
// payments/receipts. total/amountPaid are decimal strings; amount due is
// total - amountPaid (compute via lib/money's toCents, never string-compare).
export interface Invoice {
  id: number
  policyId: number
  clientId: number
  createdBy: number
  status: InvoiceStatus
  total: string
  amountPaid: string
  note: string | null
  voidedAt: string | null
  voidedBy: number | null
  voidReason: string | null
  createdAt: string
  updatedAt: string
  items: InvoiceItem[]
}

export function getInvoices(clientId: number, signal?: AbortSignal): Promise<Invoice[]> {
  return request(`/invoices?clientId=${clientId}`, { signal })
}

export function amountDueCents(invoice: Pick<Invoice, 'total' | 'amountPaid'>): number {
  return toCents(invoice.total) - toCents(invoice.amountPaid)
}

export interface CreateInvoiceItemBody {
  category: InvoiceItemCategory
  type: InvoiceItemType
  carrierId?: number | null
  description?: string | null
  amount: string
}

export interface CreateInvoiceBody {
  policyId: number
  note?: string | null
  items: CreateInvoiceItemBody[]
}

export function createInvoice(body: CreateInvoiceBody): Promise<Invoice> {
  return request('/invoices', { method: 'POST', body: JSON.stringify(body) })
}
