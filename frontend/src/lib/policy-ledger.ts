// Builds a policy's accounting ledger (running balance) from its invoices and
// payments. Pure and separately testable - the component only renders what
// this returns. All arithmetic is integer cents via lib/money's toCents;
// format only at render.
import type { Invoice, InvoicePayment } from '@/api/invoices'
import { toCents } from './money'
import { INVOICE_ITEM_TYPE_LABEL, PAYMENT_METHOD_LABEL } from './invoice-options'

export type LedgerRowKind = 'invoice' | 'payment' | 'invoice_void' | 'payment_void'

export const LEDGER_ROW_KIND_LABEL: Record<LedgerRowKind, string> = {
  invoice: 'Invoice',
  payment: 'Payment',
  invoice_void: 'Invoice void',
  payment_void: 'Payment void',
}

export interface LedgerRow {
  key: string
  at: string
  kind: LedgerRowKind
  reference: string
  description: string
  chargeCents: number
  creditCents: number
  balanceCents: number
  invoiceId: number
  isVoid: boolean
  voidReason?: string | null
}

export interface LedgerSummary {
  chargedCents: number
  creditedCents: number
  balanceCents: number
}

function invoiceDescription(invoice: Invoice): string {
  const labels = [...new Set(invoice.items.map((item) => INVOICE_ITEM_TYPE_LABEL[item.type]))]
  return labels.length > 0 ? labels.join(', ') : 'Invoice'
}

interface SortableRow {
  at: string
  id: number
  row: Omit<LedgerRow, 'balanceCents'>
}

// Invoices and payments carry voidedAt on the row itself rather than a
// separate reversal entity - so a void emits the original row (zeroed out,
// isVoid: true) plus a second `*_void` row at voidedAt describing the
// correction, keeping both visible for the audit trail without either
// affecting the balance.
export function buildPolicyLedger(invoices: Invoice[], payments: InvoicePayment[]): LedgerRow[] {
  const sortable: SortableRow[] = []

  for (const invoice of invoices) {
    const isVoid = invoice.voidedAt !== null
    const key = `invoice-${invoice.id}`
    sortable.push({
      at: invoice.createdAt,
      id: invoice.id,
      row: {
        key,
        at: invoice.createdAt,
        kind: 'invoice',
        reference: `Invoice #${invoice.id}`,
        description: invoiceDescription(invoice),
        chargeCents: isVoid ? 0 : toCents(invoice.total),
        creditCents: 0,
        invoiceId: invoice.id,
        isVoid,
        voidReason: null,
      },
    })
    if (invoice.voidedAt) {
      sortable.push({
        at: invoice.voidedAt,
        id: invoice.id,
        row: {
          key: `${key}-void`,
          at: invoice.voidedAt,
          kind: 'invoice_void',
          reference: `Invoice #${invoice.id}`,
          description: 'Invoice voided',
          chargeCents: 0,
          creditCents: 0,
          invoiceId: invoice.id,
          isVoid: true,
          voidReason: invoice.voidReason,
        },
      })
    }
  }

  for (const payment of payments) {
    const isVoid = payment.voidedAt !== null
    const key = `payment-${payment.id}`
    sortable.push({
      at: payment.createdAt,
      id: payment.id,
      row: {
        key,
        at: payment.createdAt,
        kind: 'payment',
        reference: `Payment #${payment.id}`,
        description: `${PAYMENT_METHOD_LABEL[payment.method]} payment`,
        chargeCents: 0,
        creditCents: isVoid ? 0 : toCents(payment.amountApplied),
        invoiceId: payment.invoiceId,
        isVoid,
        voidReason: null,
      },
    })
    if (payment.voidedAt) {
      sortable.push({
        at: payment.voidedAt,
        id: payment.id,
        row: {
          key: `${key}-void`,
          at: payment.voidedAt,
          kind: 'payment_void',
          reference: `Payment #${payment.id}`,
          description: 'Payment voided',
          chargeCents: 0,
          creditCents: 0,
          invoiceId: payment.invoiceId,
          isVoid: true,
          voidReason: payment.voidReason,
        },
      })
    }
  }

  // Both list endpoints return newest first; the running balance needs
  // oldest-first. Ties (same timestamp, e.g. an invoice paid off instantly)
  // break on the underlying entity id.
  sortable.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1
    return a.id - b.id
  })

  let balanceCents = 0
  return sortable.map(({ row }) => {
    balanceCents += row.chargeCents - row.creditCents
    return { ...row, balanceCents }
  })
}

// Computed independently from the same rows the table renders, so the header
// summary and the last row's running balance can never disagree.
export function summarizeLedger(rows: LedgerRow[]): LedgerSummary {
  const chargedCents = rows.reduce((sum, row) => sum + row.chargeCents, 0)
  const creditedCents = rows.reduce((sum, row) => sum + row.creditCents, 0)
  return { chargedCents, creditedCents, balanceCents: chargedCents - creditedCents }
}
