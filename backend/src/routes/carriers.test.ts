import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

describe("GET /carriers", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/carriers")).status).toBe(401)
  })

  it("lists carriers", async () => {
    const user = await ctx.user("carriers-list")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier()

    const res = await request(app).get("/carriers").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((c: { id: number }) => c.id === carrier.id)).toBe(true)
  })
})

describe("GET /carriers/:id", () => {
  it("returns 404 for an unknown id", async () => {
    const user = await ctx.user("carriers-404")
    const cookie = await makeSessionCookie(user.id)
    expect((await request(app).get("/carriers/999999999").set("Cookie", cookie)).status).toBe(404)
  })
})

describe("POST /carriers", () => {
  it("rejects staff with 403", async () => {
    const user = await ctx.user("carriers-create-staff", "staff")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .post("/carriers")
      .set("Cookie", cookie)
      .send({ name: "Acme Insurance", naic: "1234500001" })
    expect(res.status).toBe(403)
  })

  it("creates a carrier", async () => {
    const user = await ctx.user("carriers-create", "admin")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .post("/carriers")
      .set("Cookie", cookie)
      .send({ name: "Acme Insurance", naic: "1234567890" })
    expect(res.status).toBe(201)
    expect(res.body.isActive).toBe(true)
    ctx.track("carrier", res.body.id)
  })

  it("stores the contact details and normalizes blanks to null", async () => {
    const user = await ctx.user("carriers-details", "admin")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app).post("/carriers").set("Cookie", cookie).send({
      name: "Detailed Insurance",
      naic: "2234567890",
      phone: "555-0100",
      email: "service@detailed.example",
      website: "https://detailed.example",
      producerCode: "PRD-42",
      notes: "  ",
    })

    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({
      phone: "555-0100",
      email: "service@detailed.example",
      website: "https://detailed.example",
      producerCode: "PRD-42",
      notes: null,
    })
    ctx.track("carrier", res.body.id)
  })

  it("returns 400 for a malformed email", async () => {
    const user = await ctx.user("carriers-bademail", "admin")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .post("/carriers")
      .set("Cookie", cookie)
      .send({ name: "Bad Email", naic: "3234567890", email: "not-an-email" })
    expect(res.status).toBe(400)
  })

  it("returns 409 for a duplicate NAIC", async () => {
    const user = await ctx.user("carriers-dup", "admin")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier()

    const res = await request(app)
      .post("/carriers")
      .set("Cookie", cookie)
      .send({ name: "Another Name", naic: carrier.naic })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("A carrier with this NAIC already exists")
  })
})

describe("PATCH /carriers/:id", () => {
  it("rejects staff with 403", async () => {
    const user = await ctx.user("carriers-update-staff", "staff")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier()

    const res = await request(app)
      .patch(`/carriers/${carrier.id}`)
      .set("Cookie", cookie)
      .send({ name: "After" })
    expect(res.status).toBe(403)
  })

  it("updates a carrier", async () => {
    const user = await ctx.user("carriers-update", "admin")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier({ name: "Before" })

    const res = await request(app)
      .patch(`/carriers/${carrier.id}`)
      .set("Cookie", cookie)
      .send({ name: "After" })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("After")
  })

  it("deactivates a carrier without touching its other fields", async () => {
    const user = await ctx.user("carriers-deactivate", "admin")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier({ name: "Retiring", producerCode: "PRD-9" })

    const res = await request(app)
      .patch(`/carriers/${carrier.id}`)
      .set("Cookie", cookie)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ isActive: false, name: "Retiring", producerCode: "PRD-9" })
  })

  it("returns 409 when the new NAIC is taken", async () => {
    const user = await ctx.user("carriers-patch-dup", "admin")
    const cookie = await makeSessionCookie(user.id)
    const taken = await ctx.carrier()
    const carrier = await ctx.carrier()

    const res = await request(app)
      .patch(`/carriers/${carrier.id}`)
      .set("Cookie", cookie)
      .send({ naic: taken.naic })
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("A carrier with this NAIC already exists")
  })
})

describe("DELETE /carriers/:id", () => {
  it("rejects staff with 403", async () => {
    const user = await ctx.user("carriers-del-staff", "staff")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier()

    expect(
      (await request(app).delete(`/carriers/${carrier.id}`).set("Cookie", cookie)).status
    ).toBe(403)
  })

  it("allows admins", async () => {
    const user = await ctx.user("carriers-del-admin", "admin")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier()

    expect(
      (await request(app).delete(`/carriers/${carrier.id}`).set("Cookie", cookie)).status
    ).toBe(204)
  })

  it("returns 409 when the carrier still has policies", async () => {
    const user = await ctx.user("carriers-del-conflict", "admin")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app).delete(`/carriers/${policy.carrierId}`).set("Cookie", cookie)
    expect(res.status).toBe(409)
    expect(res.body.error).toBe("This carrier is referenced by existing policies or invoices")
  })
})
