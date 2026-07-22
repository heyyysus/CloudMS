import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

async function authed(prefix: string) {
  const user = await ctx.user(prefix)
  const cookie = await makeSessionCookie(user.id)
  return { user, cookie }
}

// Creates an open invoice via the API and returns its body. Defaults to a
// $300 sweep + $100 fee = $400 total.
async function makeInvoice(
  cookie: string,
  policyId: number,
  items: { category: string; type: string; carrierId?: number; amount: number }[] = [
    { category: "sweep", type: "new_business_sweep", amount: 300 },
    { category: "agency", type: "new_business_fee", amount: 100 },
  ]
) {
  const res = await request(app).post("/invoices").set("Cookie", cookie).send({ policyId, items })
  expect(res.status).toBe(201)
  return res.body
}

describe("POST /payments (full payment)", () => {
  it("closes the invoice, mints a receipt, and nets the trust account to zero", async () => {
    const { cookie } = await authed("pay-full")
    const carrier = await ctx.carrier({ name: "Geico" })
    const policy = await ctx.policy({ carrierId: carrier.id })
    const invoice = await makeInvoice(cookie, policy.id)

    const res = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 400, note: "Cash payment #1" })
    expect(res.status).toBe(201)
    // Response is the receipt.
    expect(res.body.amountApplied).toBe("400.00")
    expect(res.body.changeGiven).toBe("0.00")
    expect(res.body.amountDueAfter).toBe("0.00")
    expect(res.body.invoiceClosed).toBe(true)
    expect(res.body.payment.method).toBe("cash")
    expect(res.body.payment.note).toBe("Cash payment #1")

    const invAfter = await request(app).get(`/invoices/${invoice.id}`).set("Cookie", cookie)
    expect(invAfter.body.status).toBe("closed")
    expect(invAfter.body.amountPaid).toBe("400.00")

    // Trust ledger: +400 in, -300 sweep, -100 fee => balance 0.
    const ledger = await request(app)
      .get(`/trust-ledger?policyId=${policy.id}`)
      .set("Cookie", cookie)
    const byType = ledger.body.reduce((acc: Record<string, number>, e: { entryType: string }) => {
      acc[e.entryType] = (acc[e.entryType] ?? 0) + 1
      return acc
    }, {})
    expect(byType).toMatchObject({ payment_received: 1, carrier_sweep: 1, agency_fee: 1 })
    const sweepEntry = ledger.body.find(
      (e: { entryType: string }) => e.entryType === "carrier_sweep"
    )
    expect(sweepEntry.carrierId).toBe(carrier.id)
    expect(sweepEntry.amount).toBe("300.00")

    const balance = await request(app)
      .get(`/trust-balance?policyId=${policy.id}`)
      .set("Cookie", cookie)
    expect(balance.body.balance).toBe("0.00")
  })

  it("records change on an overpayment and still closes the invoice", async () => {
    const { cookie } = await authed("pay-over")
    const policy = await ctx.policy()
    const invoice = await makeInvoice(cookie, policy.id)

    const res = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 500 })
    expect(res.status).toBe(201)
    expect(res.body.amountApplied).toBe("400.00")
    expect(res.body.changeGiven).toBe("100.00")
    expect(res.body.invoiceClosed).toBe(true)
    // Nested (relational) money fields are canonical decimals (500 == 500.00).
    expect(Number(res.body.payment.amount)).toBe(500)

    // Change is handed back, never held in trust: balance still nets to 0.
    const balance = await request(app)
      .get(`/trust-balance?policyId=${policy.id}`)
      .set("Cookie", cookie)
    expect(balance.body.balance).toBe("0.00")
  })
})

describe("POST /payments (installments)", () => {
  it("keeps the invoice open on a partial payment, then closes it on full payment", async () => {
    const { cookie } = await authed("pay-installment")
    const policy = await ctx.policy()
    const invoice = await makeInvoice(cookie, policy.id)

    const first = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "check", amount: 150 })
    expect(first.status).toBe(201)
    expect(first.body.amountApplied).toBe("150.00")
    expect(first.body.amountDueAfter).toBe("250.00")
    expect(first.body.invoiceClosed).toBe(false)

    // Partial payment: money sits in trust, nothing swept yet.
    let balance = await request(app)
      .get(`/trust-balance?policyId=${policy.id}`)
      .set("Cookie", cookie)
    expect(balance.body.balance).toBe("150.00")
    let ledger = await request(app).get(`/trust-ledger?policyId=${policy.id}`).set("Cookie", cookie)
    expect(
      ledger.body.every((e: { entryType: string }) => e.entryType === "payment_received")
    ).toBe(true)

    const second = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "debit_card", amount: 250 })
    expect(second.body.invoiceClosed).toBe(true)
    expect(second.body.amountDueAfter).toBe("0.00")

    const invAfter = await request(app).get(`/invoices/${invoice.id}`).set("Cookie", cookie)
    expect(invAfter.body.status).toBe("closed")

    // Now fully collected and swept => balance 0.
    balance = await request(app).get(`/trust-balance?policyId=${policy.id}`).set("Cookie", cookie)
    expect(balance.body.balance).toBe("0.00")
    ledger = await request(app).get(`/trust-ledger?policyId=${policy.id}`).set("Cookie", cookie)
    // 2 payments in + 1 sweep out + 1 fee out.
    expect(ledger.body).toHaveLength(4)
  })
})

describe("POST /payments (errors)", () => {
  it("returns 401 without a cookie", async () => {
    expect(
      (await request(app).post("/payments").send({ invoiceId: 1, method: "cash", amount: 1 }))
        .status
    ).toBe(401)
  })

  it("returns 404 for a nonexistent invoice", async () => {
    const { cookie } = await authed("pay-404")
    const res = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: 999999999, method: "cash", amount: 10 })
    expect(res.status).toBe(404)
  })

  it("returns 409 when paying an already-closed invoice", async () => {
    const { cookie } = await authed("pay-closed")
    const policy = await ctx.policy()
    const invoice = await makeInvoice(cookie, policy.id)
    await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 400 })

    const res = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 50 })
    expect(res.status).toBe(409)
  })
})

describe("POST /payments/:id/void", () => {
  it("reverses the payment, reopens the invoice, and nets the trust ledger to zero", async () => {
    const { cookie } = await authed("pay-void")
    const policy = await ctx.policy()
    const invoice = await makeInvoice(cookie, policy.id)
    const receipt = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 400 })
    const paymentId = receipt.body.payment.id

    const res = await request(app)
      .post(`/payments/${paymentId}/void`)
      .set("Cookie", cookie)
      .send({ reason: "wrong amount" })
    expect(res.status).toBe(200)
    expect(res.body.voidedAt).toBeTruthy()
    expect(res.body.voidReason).toBe("wrong amount")

    const invAfter = await request(app).get(`/invoices/${invoice.id}`).set("Cookie", cookie)
    expect(invAfter.body.status).toBe("open")
    expect(invAfter.body.amountPaid).toBe("0.00")

    // payment in/out + sweep out/in + fee out/in all cancel.
    const balance = await request(app)
      .get(`/trust-balance?policyId=${policy.id}`)
      .set("Cookie", cookie)
    expect(balance.body.balance).toBe("0.00")

    // The invoice can be paid again after the void.
    const repay = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "credit_card", amount: 400 })
    expect(repay.status).toBe(201)
    expect(repay.body.invoiceClosed).toBe(true)
  })

  it("returns 409 when voiding an already-voided payment", async () => {
    const { cookie } = await authed("pay-void-twice")
    const policy = await ctx.policy()
    const invoice = await makeInvoice(cookie, policy.id)
    const receipt = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 400 })
    const paymentId = receipt.body.payment.id
    await request(app).post(`/payments/${paymentId}/void`).set("Cookie", cookie).send({})

    const res = await request(app)
      .post(`/payments/${paymentId}/void`)
      .set("Cookie", cookie)
      .send({})
    expect(res.status).toBe(409)
  })

  it("returns 404 for a nonexistent payment", async () => {
    const { cookie } = await authed("pay-void-404")
    expect(
      (await request(app).post("/payments/999999999/void").set("Cookie", cookie).send({})).status
    ).toBe(404)
  })
})

describe("GET /payments and /receipts (searchable by client)", () => {
  it("lists a client's payments and receipts across policies", async () => {
    const { cookie } = await authed("acct-by-client")
    const client = await ctx.client()
    const policyA = await ctx.policy({ clientId: client.id })
    const policyB = await ctx.policy({ clientId: client.id })

    for (const policyId of [policyA.id, policyB.id]) {
      const inv = await makeInvoice(cookie, policyId, [
        { category: "agency", type: "new_business_fee", amount: 50 },
      ])
      await request(app)
        .post("/payments")
        .set("Cookie", cookie)
        .send({ invoiceId: inv.id, method: "cash", amount: 50 })
    }

    const payments = await request(app).get(`/payments?clientId=${client.id}`).set("Cookie", cookie)
    expect(payments.status).toBe(200)
    expect(payments.body).toHaveLength(2)

    const receipts = await request(app).get(`/receipts?clientId=${client.id}`).set("Cookie", cookie)
    expect(receipts.body).toHaveLength(2)

    const balance = await request(app)
      .get(`/trust-balance?clientId=${client.id}`)
      .set("Cookie", cookie)
    expect(balance.body.balance).toBe("0.00")
  })

  it("has no PATCH or DELETE route for a payment", async () => {
    const { cookie } = await authed("pay-immutable")
    const policy = await ctx.policy()
    const invoice = await makeInvoice(cookie, policy.id)
    const receipt = await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: invoice.id, method: "cash", amount: 400 })
    const paymentId = receipt.body.payment.id

    expect(
      (await request(app).patch(`/payments/${paymentId}`).set("Cookie", cookie).send({})).status
    ).toBe(404)
    expect((await request(app).delete(`/payments/${paymentId}`).set("Cookie", cookie)).status).toBe(
      404
    )
  })
})
