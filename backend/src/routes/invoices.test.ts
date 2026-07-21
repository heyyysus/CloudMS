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

describe("POST /invoices", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).post("/invoices").send({ policyId: 1, items: [] })).status).toBe(401)
  })

  it("creates an open invoice, defaulting a sweep item's carrier to the policy's carrier", async () => {
    const { user, cookie } = await authed("inv-create")
    const carrier = await ctx.carrier({ name: "Geico" })
    const policy = await ctx.policy({ carrierId: carrier.id })

    const res = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        note: "New business",
        items: [
          { category: "sweep", type: "new_business_sweep", amount: 300 },
          { category: "agency", type: "new_business_fee", amount: 99 },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.status).toBe("open")
    expect(res.body.total).toBe("399.00")
    expect(res.body.amountPaid).toBe("0.00")
    expect(res.body.clientId).toBe(policy.clientId)
    expect(res.body.createdBy).toBe(user.id)
    expect(res.body.items).toHaveLength(2)
    const sweep = res.body.items.find((i: { type: string }) => i.type === "new_business_sweep")
    expect(sweep.carrierId).toBe(carrier.id)
    // Amounts are decimal strings; nested (relational) fields are canonical
    // decimals and may drop trailing zeros (300 == 300.00).
    expect(Number(sweep.amount)).toBe(300)
    const fee = res.body.items.find((i: { type: string }) => i.type === "new_business_fee")
    expect(fee.carrierId).toBeNull()
  })

  it("honors an explicit carrier on a sweep item", async () => {
    const { cookie } = await authed("inv-carrier-override")
    const policy = await ctx.policy()
    const otherCarrier = await ctx.carrier({ name: "Progressive" })

    const res = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [
          { category: "sweep", type: "endorsement_sweep", carrierId: otherCarrier.id, amount: 50 },
        ],
      })
    expect(res.status).toBe(201)
    expect(res.body.items[0].carrierId).toBe(otherCarrier.id)
  })

  it("returns 404 for a nonexistent policy", async () => {
    const { cookie } = await authed("inv-404")
    const res = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: 999999999,
        items: [{ category: "agency", type: "new_business_fee", amount: 10 }],
      })
    expect(res.status).toBe(404)
  })

  it("rejects an empty items list", async () => {
    const { cookie } = await authed("inv-empty")
    const policy = await ctx.policy()
    const res = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({ policyId: policy.id, items: [] })
    expect(res.status).toBe(400)
  })

  it("rejects a category/type mismatch", async () => {
    const { cookie } = await authed("inv-mismatch")
    const policy = await ctx.policy()
    const res = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_sweep", amount: 10 }],
      })
    expect(res.status).toBe(400)
  })

  it("rejects a carrier on an agency fee item", async () => {
    const { cookie } = await authed("inv-fee-carrier")
    const policy = await ctx.policy()
    const carrier = await ctx.carrier()
    const res = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [
          { category: "agency", type: "new_business_fee", carrierId: carrier.id, amount: 10 },
        ],
      })
    expect(res.status).toBe(400)
  })

  it("rejects a non-positive amount", async () => {
    const { cookie } = await authed("inv-zero")
    const policy = await ctx.policy()
    const res = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 0 }],
      })
    expect(res.status).toBe(400)
  })
})

describe("GET /invoices", () => {
  it("lists by clientId and by policyId, newest first, scoped correctly", async () => {
    const { cookie } = await authed("inv-list")
    const client = await ctx.client()
    const policyA = await ctx.policy({ clientId: client.id })
    const policyB = await ctx.policy({ clientId: client.id })
    const otherPolicy = await ctx.policy()

    const mk = (policyId: number) =>
      request(app)
        .post("/invoices")
        .set("Cookie", cookie)
        .send({ policyId, items: [{ category: "agency", type: "new_business_fee", amount: 10 }] })

    const first = await mk(policyA.id)
    const second = await mk(policyB.id)
    await mk(otherPolicy.id)

    const byClient = await request(app).get(`/invoices?clientId=${client.id}`).set("Cookie", cookie)
    expect(byClient.status).toBe(200)
    expect(byClient.body.map((i: { id: number }) => i.id)).toEqual([second.body.id, first.body.id])

    const byPolicy = await request(app)
      .get(`/invoices?policyId=${policyA.id}`)
      .set("Cookie", cookie)
    expect(byPolicy.body).toHaveLength(1)
    expect(byPolicy.body[0].id).toBe(first.body.id)
  })

  it("returns 400 without a clientId or policyId", async () => {
    const { cookie } = await authed("inv-list-nofilter")
    expect((await request(app).get("/invoices").set("Cookie", cookie)).status).toBe(400)
  })

  it("returns 404 for a missing invoice", async () => {
    const { cookie } = await authed("inv-get-404")
    expect((await request(app).get("/invoices/999999999").set("Cookie", cookie)).status).toBe(404)
  })
})

describe("POST /invoices/:id/void", () => {
  it("voids an unpaid invoice", async () => {
    const { cookie } = await authed("inv-void")
    const policy = await ctx.policy()
    const created = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 10 }],
      })

    const res = await request(app)
      .post(`/invoices/${created.body.id}/void`)
      .set("Cookie", cookie)
      .send({ reason: "created in error" })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("void")
    expect(res.body.voidReason).toBe("created in error")
  })

  it("refuses to void an invoice with an active payment (409)", async () => {
    const { cookie } = await authed("inv-void-paid")
    const policy = await ctx.policy()
    const created = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 10 }],
      })
    await request(app)
      .post("/payments")
      .set("Cookie", cookie)
      .send({ invoiceId: created.body.id, method: "cash", amount: 10 })

    const res = await request(app)
      .post(`/invoices/${created.body.id}/void`)
      .set("Cookie", cookie)
      .send({})
    expect(res.status).toBe(409)
  })

  it("has no PATCH or DELETE route for an invoice", async () => {
    const { cookie } = await authed("inv-immutable")
    const policy = await ctx.policy()
    const created = await request(app)
      .post("/invoices")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 10 }],
      })

    expect(
      (await request(app).patch(`/invoices/${created.body.id}`).set("Cookie", cookie).send({}))
        .status
    ).toBe(404)
    expect(
      (await request(app).delete(`/invoices/${created.body.id}`).set("Cookie", cookie)).status
    ).toBe(404)
  })
})
