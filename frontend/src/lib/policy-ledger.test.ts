import { describe, expect, it } from 'vitest'
import { buildPolicyLedger, summarizeLedger } from './policy-ledger'
import type { Invoice, InvoicePayment } from '@/api/invoices'

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    policyId: 900,
    clientId: 155,
    createdBy: 1,
    status: 'open',
    total: '100.00',
    amountPaid: '0.00',
    note: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    items: [
      {
        id: 1,
        invoiceId: 1,
        category: 'agency',
        type: 'new_business_fee',
        carrierId: null,
        description: null,
        amount: '100.00',
        createdAt: '2026-01-01T00:00:00.000Z',
        carrier: null,
      },
    ],
    ...overrides,
  }
}

function makePayment(overrides: Partial<InvoicePayment> = {}): InvoicePayment {
  return {
    id: 1,
    invoiceId: 1,
    policyId: 900,
    clientId: 155,
    method: 'cash',
    amount: '40.00',
    amountApplied: '40.00',
    changeGiven: '0.00',
    note: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    createdAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('buildPolicyLedger', () => {
  it('returns nothing for empty input', () => {
    expect(buildPolicyLedger([], [])).toEqual([])
  })

  it('charges the full total for a single invoice', () => {
    const rows = buildPolicyLedger([makeInvoice({ total: '100.00' })], [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'invoice',
      reference: 'Invoice #1',
      chargeCents: 10000,
      creditCents: 0,
      balanceCents: 10000,
      isVoid: false,
    })
  })

  it('applies a partial payment as a credit for amountApplied, leaving a balance', () => {
    const rows = buildPolicyLedger(
      [makeInvoice({ total: '100.00' })],
      [makePayment({ amountApplied: '40.00' })]
    )
    expect(rows.map((r) => r.balanceCents)).toEqual([10000, 6000])
  })

  it('closes the balance to zero when payments cover the invoice total', () => {
    const rows = buildPolicyLedger(
      [makeInvoice({ total: '100.00' })],
      [makePayment({ id: 1, amountApplied: '100.00' })]
    )
    expect(rows.at(-1)?.balanceCents).toBe(0)
  })

  it('credits amountApplied rather than amount when change was given back', () => {
    const rows = buildPolicyLedger(
      [makeInvoice({ total: '40.00' })],
      [makePayment({ amount: '50.00', amountApplied: '40.00', changeGiven: '10.00' })]
    )
    const paymentRow = rows.find((r) => r.kind === 'payment')
    expect(paymentRow?.creditCents).toBe(4000)
    expect(rows.at(-1)?.balanceCents).toBe(0)
  })

  it('zeroes a voided invoice and adds a void row with no balance effect', () => {
    const rows = buildPolicyLedger(
      [
        makeInvoice({
          total: '100.00',
          voidedAt: '2026-01-03T00:00:00.000Z',
          voidedBy: 2,
          voidReason: 'entered in error',
        }),
      ],
      []
    )
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ kind: 'invoice', chargeCents: 0, isVoid: true, balanceCents: 0 })
    expect(rows[1]).toMatchObject({
      kind: 'invoice_void',
      chargeCents: 0,
      creditCents: 0,
      balanceCents: 0,
      voidReason: 'entered in error',
    })
  })

  it('withdraws a voided payment credit, restoring the prior balance', () => {
    const rows = buildPolicyLedger(
      [makeInvoice({ total: '100.00' })],
      [
        makePayment({
          amountApplied: '40.00',
          voidedAt: '2026-01-03T00:00:00.000Z',
          voidedBy: 2,
          voidReason: 'wrong invoice',
        }),
      ]
    )
    // invoice (10000) -> payment zeroed (10000) -> payment void (10000)
    expect(rows.map((r) => r.balanceCents)).toEqual([10000, 10000, 10000])
    expect(rows[1]).toMatchObject({ kind: 'payment', creditCents: 0, isVoid: true })
    expect(rows[2]).toMatchObject({ kind: 'payment_void', voidReason: 'wrong invoice' })
  })

  it('orders oldest to newest and breaks same-timestamp ties by entity id', () => {
    const at = '2026-01-05T00:00:00.000Z'
    const rows = buildPolicyLedger(
      [makeInvoice({ id: 2, total: '20.00', createdAt: at })],
      [makePayment({ id: 1, invoiceId: 2, amountApplied: '5.00', createdAt: at })]
    )
    // invoice id 2 vs payment id 1: tiebreak is by id, so payment (id 1) sorts first.
    expect(rows.map((r) => r.kind)).toEqual(['payment', 'invoice'])
    expect(rows.map((r) => r.balanceCents)).toEqual([-500, 1500])
  })
})

describe('summarizeLedger', () => {
  it('summarizes zero for no rows', () => {
    expect(summarizeLedger([])).toEqual({ chargedCents: 0, creditedCents: 0, balanceCents: 0 })
  })

  it('matches the last row balance for a simple ledger', () => {
    const rows = buildPolicyLedger(
      [makeInvoice({ total: '100.00' })],
      [makePayment({ amountApplied: '40.00' })]
    )
    expect(summarizeLedger(rows)).toEqual({
      chargedCents: 10000,
      creditedCents: 4000,
      balanceCents: 6000,
    })
  })

  it('excludes voided amounts from both totals', () => {
    const rows = buildPolicyLedger(
      [
        makeInvoice({
          total: '100.00',
          voidedAt: '2026-01-03T00:00:00.000Z',
          voidReason: 'oops',
        }),
      ],
      []
    )
    expect(summarizeLedger(rows)).toEqual({ chargedCents: 0, creditedCents: 0, balanceCents: 0 })
  })
})
