import { describe, expect, it } from "vitest"
import {
  invoiceCreatedLogBody,
  invoiceVoidedLogBody,
  paymentRecordedLogBody,
  paymentVoidedLogBody,
} from "./accountingLogs"

describe("invoiceCreatedLogBody", () => {
  it("lists every line item with its label and amount", () => {
    expect(
      invoiceCreatedLogBody({
        invoiceId: 42,
        total: "400.00",
        items: [
          { type: "new_business_sweep", amount: "300.00" },
          { type: "new_business_fee", amount: "100.00" },
        ],
      })
    ).toBe(
      "Invoice #42 created — total $400.00 (new business sweep $300.00, new business fee $100.00)."
    )
  })

  it("formats amounts that come back as canonical decimals", () => {
    // Drizzle returns numeric columns as canonical decimals, so an amount can
    // arrive as "300" rather than "300.00".
    expect(
      invoiceCreatedLogBody({
        invoiceId: 7,
        total: "1250.00",
        items: [{ type: "endorsement_sweep", amount: "1250" }],
      })
    ).toBe("Invoice #7 created — total $1,250.00 (endorsement sweep $1,250.00).")
  })
})

describe("paymentRecordedLogBody", () => {
  const base = {
    invoiceId: 42,
    method: "cash" as const,
    changeGiven: "0.00",
  }

  it("reports the balance still due on a partial payment", () => {
    expect(
      paymentRecordedLogBody({
        ...base,
        method: "check",
        amount: "150.00",
        amountApplied: "150.00",
        amountDueAfter: "250.00",
        invoiceClosed: false,
      })
    ).toBe("Payment of $150.00 by check on invoice #42 — $150.00 applied, $250.00 still due.")
  })

  it("reports the close on a settling payment", () => {
    expect(
      paymentRecordedLogBody({
        ...base,
        amount: "400.00",
        amountApplied: "400.00",
        amountDueAfter: "0.00",
        invoiceClosed: true,
      })
    ).toBe(
      "Payment of $400.00 by cash on invoice #42 — $400.00 applied, invoice paid in full and closed."
    )
  })

  it("calls out change handed back on an overpayment", () => {
    expect(
      paymentRecordedLogBody({
        ...base,
        amount: "500.00",
        amountApplied: "400.00",
        changeGiven: "100.00",
        amountDueAfter: "0.00",
        invoiceClosed: true,
      })
    ).toBe(
      "Payment of $500.00 by cash on invoice #42 — $400.00 applied, $100.00 change given, invoice paid in full and closed."
    )
  })

  it("spells out the underscored payment methods", () => {
    expect(
      paymentRecordedLogBody({
        ...base,
        method: "credit_card",
        amount: "400.00",
        amountApplied: "400.00",
        amountDueAfter: "0.00",
        invoiceClosed: true,
      })
    ).toContain("by credit card on invoice #42")
  })
})

describe("invoiceVoidedLogBody", () => {
  it("appends the reason when one was given", () => {
    expect(
      invoiceVoidedLogBody({ invoiceId: 42, total: "400.00", reason: "duplicate of #41" })
    ).toBe("Invoice #42 voided — total $400.00. Reason: duplicate of #41.")
  })

  it("stops after the total when no reason was given", () => {
    expect(invoiceVoidedLogBody({ invoiceId: 42, total: "400.00", reason: null })).toBe(
      "Invoice #42 voided — total $400.00."
    )
  })

  it("treats a blank reason as no reason", () => {
    expect(invoiceVoidedLogBody({ invoiceId: 42, total: "400.00", reason: "   " })).toBe(
      "Invoice #42 voided — total $400.00."
    )
  })
})

describe("paymentVoidedLogBody", () => {
  const base = {
    paymentId: 17,
    invoiceId: 42,
    method: "cash" as const,
    reason: null,
  }

  it("says the invoice reopened when the voided payment had closed it", () => {
    expect(
      paymentVoidedLogBody({
        ...base,
        amount: "400.00",
        amountApplied: "400.00",
        amountDueAfter: "400.00",
        invoiceStatusBefore: "closed",
        reason: "card chargeback",
      })
    ).toBe(
      "Payment #17 of $400.00 by cash on invoice #42 voided — $400.00 reversed, invoice reopened with $400.00 now due. Reason: card chargeback."
    )
  })

  it("just reports the new balance when the invoice was already open", () => {
    expect(
      paymentVoidedLogBody({
        ...base,
        method: "check",
        amount: "150.00",
        amountApplied: "150.00",
        amountDueAfter: "400.00",
        invoiceStatusBefore: "open",
      })
    ).toBe(
      "Payment #17 of $150.00 by check on invoice #42 voided — $150.00 reversed, $400.00 now due."
    )
  })

  it("says the invoice stays void when it was already void", () => {
    expect(
      paymentVoidedLogBody({
        ...base,
        method: "check",
        amount: "150.00",
        amountApplied: "150.00",
        amountDueAfter: "400.00",
        invoiceStatusBefore: "void",
      })
    ).toBe(
      "Payment #17 of $150.00 by check on invoice #42 voided — $150.00 reversed, invoice remains void."
    )
  })
})
