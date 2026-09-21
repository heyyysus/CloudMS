import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { MISSING_ROW_ID, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

describe("GET /clients", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/clients")).status).toBe(401)
  })

  it("lists clients", async () => {
    const user = await ctx.user("clients-list")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()

    const res = await request(app).get("/clients").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((c: { id: string }) => c.id === client.id)).toBe(true)
  })

  it("returns hydrated rows", async () => {
    const user = await ctx.user("clients-list-shape")
    const cookie = await ctx.cookie(user.id)
    const person = await ctx.person({ firstName: "Jane", lastName: "Doe" })
    const client = await ctx.client({ namedInsuredId: person.id })
    await ctx.clientEmail(client.id, "jane@example.com")

    const res = await request(app).get("/clients").set("Cookie", cookie)
    expect(res.status).toBe(200)
    const row = res.body.find((c: { id: string }) => c.id === client.id)
    expect(row.namedInsured.firstName).toBe("Jane")
    expect(row.secondNamedInsured).toBeNull()
    expect(row.emails[0].email).toBe("jane@example.com")
    expect(Array.isArray(row.phones)).toBe(true)
  })

  it("orders by last name then first name", async () => {
    const user = await ctx.user("clients-list-order")
    const cookie = await ctx.cookie(user.id)
    const suffix = Math.random().toString(36).slice(2)
    const aaa = await ctx.person({ firstName: "First", lastName: `Aaa-${suffix}` })
    const zzz = await ctx.person({ firstName: "First", lastName: `Zzz-${suffix}` })
    const clientA = await ctx.client({ namedInsuredId: aaa.id })
    const clientZ = await ctx.client({ namedInsuredId: zzz.id })

    const res = await request(app).get("/clients").set("Cookie", cookie)
    expect(res.status).toBe(200)
    const ids = res.body.map((c: { id: string }) => c.id)
    const indexA = ids.indexOf(clientA.id)
    const indexZ = ids.indexOf(clientZ.id)
    expect(indexA).toBeGreaterThanOrEqual(0)
    expect(indexZ).toBeGreaterThanOrEqual(0)
    expect(indexA).toBeLessThan(indexZ)
  })
})

describe("GET /clients/:id", () => {
  it("returns a client with nested named insured, phones, and emails", async () => {
    const user = await ctx.user("clients-get")
    const cookie = await ctx.cookie(user.id)
    const person = await ctx.person({ firstName: "Jane", lastName: "Doe" })
    const client = await ctx.client({ namedInsuredId: person.id })

    const res = await request(app).get(`/clients/${client.id}`).set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.namedInsured.firstName).toBe("Jane")
    expect(res.body.phones).toEqual([])
    expect(res.body.emails).toEqual([])
  })

  it("returns 404 for an unknown id", async () => {
    const user = await ctx.user("clients-404")
    const cookie = await ctx.cookie(user.id)
    expect(
      (await request(app).get(`/clients/${MISSING_ROW_ID}`).set("Cookie", cookie)).status
    ).toBe(404)
  })

  it("does not see a client from another org", async () => {
    const user = await ctx.user("clients-wrongorg", "admin")
    const cookie = await ctx.cookie(user.id)
    const other = await ctx.org()
    const suffix = Math.random().toString(36).slice(2)
    const theirPerson = await ctx.person({ orgId: other.id, lastName: `Wrongorg-${suffix}` })
    const client = await ctx.client({ orgId: other.id, namedInsuredId: theirPerson.id })

    const list = await request(app).get("/clients").set("Cookie", cookie)
    expect(list.body.some((c: { id: string }) => c.id === client.id)).toBe(false)

    const searched = await request(app)
      .get(`/clients?q=${theirPerson.lastName}`)
      .set("Cookie", cookie)
    expect(searched.status).toBe(200)
    expect(searched.body.some((c: { id: string }) => c.id === client.id)).toBe(false)
    expect((await request(app).get(`/clients/${client.id}`).set("Cookie", cookie)).status).toBe(404)
    expect(
      (
        await request(app)
          .patch(`/clients/${client.id}`)
          .set("Cookie", cookie)
          .send({ mailingAddress1: "X" })
      ).status
    ).toBe(404)
    expect((await request(app).delete(`/clients/${client.id}`).set("Cookie", cookie)).status).toBe(
      404
    )
  })
})

describe("POST /clients", () => {
  it("creates a client with phones and emails", async () => {
    const user = await ctx.user("clients-create")
    const cookie = await ctx.cookie(user.id)
    const person = await ctx.person()

    const res = await request(app)
      .post("/clients")
      .set("Cookie", cookie)
      .send({
        namedInsuredId: person.id,
        phones: ["555-1234"],
        emails: ["client@example.com"],
      })
    expect(res.status).toBe(201)
    expect(res.body.phones).toHaveLength(1)
    expect(res.body.emails).toHaveLength(1)
    ctx.track("client", res.body.id)
  })
})

describe("PATCH /clients/:id", () => {
  it("leaves phones untouched when omitted from the body", async () => {
    const user = await ctx.user("clients-patch-omit")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()
    await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ phones: ["111-1111"] })

    const res = await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ mailingAddress1: "2 New St", mailingCity: "Newtown", mailingState: "ca" })
    expect(res.status).toBe(200)
    expect(res.body.mailingAddress1).toBe("2 New St")
    expect(res.body.mailingCity).toBe("Newtown")
    expect(res.body.mailingState).toBe("CA")
    expect(res.body.phones.map((p: { phoneNumber: string }) => p.phoneNumber)).toEqual(["111-1111"])
  })

  it("rejects an invalid state code", async () => {
    const user = await ctx.user("clients-patch-invalid-state")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()

    const res = await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ mailingState: "California" })
    expect(res.status).toBe(400)
  })

  it("replaces phones when an array is given", async () => {
    const user = await ctx.user("clients-patch-replace")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()
    await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ phones: ["111-1111"] })

    const res = await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ phones: ["222-2222"] })
    expect(res.status).toBe(200)
    expect(res.body.phones.map((p: { phoneNumber: string }) => p.phoneNumber)).toEqual(["222-2222"])
  })

  it("clears phones when an empty array is given", async () => {
    const user = await ctx.user("clients-patch-clear")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()
    await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ phones: ["111-1111"] })

    const res = await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ phones: [] })
    expect(res.status).toBe(200)
    expect(res.body.phones).toEqual([])
  })

  it("rejects a PATCH repointing namedInsuredId at another org's person", async () => {
    const user = await ctx.user("clients-crossorg")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()
    const other = await ctx.org()
    const theirPerson = await ctx.person({ orgId: other.id })

    const res = await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ namedInsuredId: theirPerson.id })
    expect(res.status).toBe(409)

    const after = await request(app).get(`/clients/${client.id}`).set("Cookie", cookie)
    expect(after.body.namedInsured.id).toBe(client.namedInsuredId)
  })
})

describe("DELETE /clients/:id", () => {
  it("rejects staff with 403", async () => {
    const user = await ctx.user("clients-del-staff", "staff")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()

    expect((await request(app).delete(`/clients/${client.id}`).set("Cookie", cookie)).status).toBe(
      403
    )
  })

  it("allows admins", async () => {
    const user = await ctx.user("clients-del-admin", "admin")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()

    expect((await request(app).delete(`/clients/${client.id}`).set("Cookie", cookie)).status).toBe(
      204
    )
  })

  it("returns 409 when the client still has a policy", async () => {
    const user = await ctx.user("clients-del-conflict", "admin")
    const cookie = await ctx.cookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app).delete(`/clients/${policy.clientId}`).set("Cookie", cookie)
    expect(res.status).toBe(409)
  })
})

describe("GET /clients?q=", () => {
  it("finds a client by partial phone number", async () => {
    const user = await ctx.user("clients-search-phone")
    const cookie = await ctx.cookie(user.id)
    const client = await ctx.client()
    await request(app)
      .patch(`/clients/${client.id}`)
      .set("Cookie", cookie)
      .send({ phones: ["310-555-9876"] })

    const res = await request(app).get("/clients?q=555-9876").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((c: { id: string }) => c.id === client.id)).toBe(true)
  })

  it("finds a client by cross-column full name", async () => {
    const user = await ctx.user("clients-search-name")
    const cookie = await ctx.cookie(user.id)
    const person = await ctx.person({ firstName: "Marisol", lastName: "Alvarez" })
    const client = await ctx.client({ namedInsuredId: person.id })

    const res = await request(app).get("/clients?q=marisol alva").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((c: { id: string }) => c.id === client.id)).toBe(true)
  })

  it("returns 400 when q is too short", async () => {
    const user = await ctx.user("clients-search-short")
    const cookie = await ctx.cookie(user.id)

    expect((await request(app).get("/clients?q=a").set("Cookie", cookie)).status).toBe(400)
  })
})
