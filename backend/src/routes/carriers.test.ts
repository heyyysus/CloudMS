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
  it("creates a carrier", async () => {
    const user = await ctx.user("carriers-create")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .post("/carriers")
      .set("Cookie", cookie)
      .send({ name: "Acme Insurance", naic: "1234567890" })
    expect(res.status).toBe(201)
    ctx.track("carrier", res.body.id)
  })

  it("returns 409 for a duplicate NAIC", async () => {
    const user = await ctx.user("carriers-dup")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier()

    const res = await request(app)
      .post("/carriers")
      .set("Cookie", cookie)
      .send({ name: "Another Name", naic: carrier.naic })
    expect(res.status).toBe(409)
  })
})

describe("PATCH /carriers/:id", () => {
  it("updates a carrier", async () => {
    const user = await ctx.user("carriers-update")
    const cookie = await makeSessionCookie(user.id)
    const carrier = await ctx.carrier({ name: "Before" })

    const res = await request(app)
      .patch(`/carriers/${carrier.id}`)
      .set("Cookie", cookie)
      .send({ name: "After" })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("After")
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
  })
})
