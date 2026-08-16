import { describe, expect, it } from "vitest"
import {
  type AccountingDocumentMeta,
  buildAccountingDocumentPdf,
  formatDocumentNumber,
  type InvoiceDetail,
} from "./accountingDocuments"

describe("formatDocumentNumber", () => {
  it("zero-pads to five digits", () => {
    expect(formatDocumentNumber(1)).toBe("#00001")
    expect(formatDocumentNumber(12)).toBe("#00012")
    expect(formatDocumentNumber(99999)).toBe("#99999")
  })

  it("lets ids past five digits grow rather than truncating", () => {
    expect(formatDocumentNumber(123456)).toBe("#123456")
  })
})

// A minimal invoice detail. The renderer only reads the fields listed here, so
// the cast keeps the fixture readable rather than spelling out every column of
// every joined row.
function makeInvoice(overrides: Partial<Record<string, unknown>> = {}): InvoiceDetail {
  return {
    id: 12,
    policyId: 7,
    clientId: 3,
    status: "open",
    total: "400.00",
    amountPaid: "0.00",
    note: null,
    items: [
      {
        id: 1,
        type: "new_business_sweep",
        description: "Down payment",
        amount: "300.00",
        carrier: { id: 1, name: "Geico" },
      },
      { id: 2, type: "new_business_fee", description: null, amount: "100.00", carrier: null },
    ],
    payments: [],
    receipts: [],
    ...overrides,
  } as unknown as InvoiceDetail
}

function meta(overrides: Partial<AccountingDocumentMeta> = {}): AccountingDocumentMeta {
  return {
    kind: "invoice",
    invoice: makeInvoice(),
    clientName: "Ada Lovelace",
    policyNumber: "POL-123",
    generatedAt: new Date("2026-08-16T18:30:00Z"),
    ...overrides,
  }
}

describe("buildAccountingDocumentPdf", () => {
  it("renders an invoice with no payments", async () => {
    const pdf = await buildAccountingDocumentPdf(meta())
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF")
    expect(pdf.length).toBeGreaterThan(500)
  })

  it("renders a receipt with payments, a note, and change given", async () => {
    const invoice = makeInvoice({
      amountPaid: "400.00",
      status: "closed",
      note: "Paid at the counter.",
      payments: [
        {
          id: 40,
          method: "cash",
          amountApplied: "400.00",
          changeGiven: "20.00",
          note: "Two twenties back",
          voidedAt: null,
        },
      ],
      receipts: [{ id: 9, paymentId: 40 }],
    })
    const pdf = await buildAccountingDocumentPdf(
      meta({ kind: "receipt", invoice, receipt: { id: 9, paymentId: 40 } })
    )
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF")
  })

  it("renders when every payment on the invoice has been voided", async () => {
    const invoice = makeInvoice({
      payments: [
        {
          id: 41,
          method: "check",
          amountApplied: "400.00",
          changeGiven: "0.00",
          note: null,
          voidedAt: new Date(),
        },
      ],
      receipts: [{ id: 10, paymentId: 41 }],
    })
    const pdf = await buildAccountingDocumentPdf(meta({ invoice }))
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF")
  })
})
