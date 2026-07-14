import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

describe("GET /vehicles", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/vehicles")).status).toBe(401)
  })

  it("lists all vehicles when no policyId is given", async () => {
    const user = await ctx.user("vehicles-list")
    const cookie = await makeSessionCookie(user.id)
    const vehicle = await ctx.vehicle()

    const res = await request(app).get("/vehicles").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((v: { id: number }) => v.id === vehicle.id)).toBe(true)
  })

  it("filters by policyId", async () => {
    const user = await ctx.user("vehicles-filter")
    const cookie = await makeSessionCookie(user.id)
    const policyA = await ctx.policy()
    const policyB = await ctx.policy()
    const vehicleA = await ctx.vehicle({ policyId: policyA.id })
    await ctx.vehicle({ policyId: policyB.id })

    const res = await request(app)
      .get(`/vehicles?policyId=${policyA.id}`)
      .set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.map((v: { id: number }) => v.id)).toEqual([vehicleA.id])
  })

  it("returns 400 for a non-numeric policyId", async () => {
    const user = await ctx.user("vehicles-badpolicyid")
    const cookie = await makeSessionCookie(user.id)

    expect(
      (await request(app).get("/vehicles?policyId=abc").set("Cookie", cookie)).status
    ).toBe(400)
  })
})

describe("POST /vehicles", () => {
  it("creates a vehicle", async () => {
    const user = await ctx.user("vehicles-create")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app)
      .post("/vehicles")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        vin: "TESTVIN0000000001",
        make: "Honda",
        model: "Accord",
        year: 2021,
        garagingZip: "90210",
      })
    expect(res.status).toBe(201)
    ctx.track("vehicle", res.body.id)
  })

  it("returns 409 for a duplicate VIN", async () => {
    const user = await ctx.user("vehicles-dupvin")
    const cookie = await makeSessionCookie(user.id)
    const vehicle = await ctx.vehicle()
    const policy = await ctx.policy()

    const res = await request(app)
      .post("/vehicles")
      .set("Cookie", cookie)
      .send({
        policyId: policy.id,
        vin: vehicle.vin,
        make: "Honda",
        model: "Civic",
        year: 2020,
        garagingZip: "12345",
      })
    expect(res.status).toBe(409)
  })
})

describe("PATCH /vehicles/:id", () => {
  it("updates a vehicle", async () => {
    const user = await ctx.user("vehicles-update")
    const cookie = await makeSessionCookie(user.id)
    const vehicle = await ctx.vehicle({ make: "Honda" })

    const res = await request(app)
      .patch(`/vehicles/${vehicle.id}`)
      .set("Cookie", cookie)
      .send({ make: "Toyota" })
    expect(res.status).toBe(200)
    expect(res.body.make).toBe("Toyota")
  })
})

describe("DELETE /vehicles/:id", () => {
  it("allows staff (no admin restriction)", async () => {
    const user = await ctx.user("vehicles-del-staff", "staff")
    const cookie = await makeSessionCookie(user.id)
    const vehicle = await ctx.vehicle()

    expect(
      (await request(app).delete(`/vehicles/${vehicle.id}`).set("Cookie", cookie)).status
    ).toBe(204)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await ctx.user("vehicles-del-404")
    const cookie = await makeSessionCookie(user.id)

    expect(
      (await request(app).delete("/vehicles/999999999").set("Cookie", cookie)).status
    ).toBe(404)
  })
})
