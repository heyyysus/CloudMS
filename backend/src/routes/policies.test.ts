import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

describe("GET /policies", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/policies")).status).toBe(401)
  })

  it("lists policies", async () => {
    const user = await ctx.user("policies-list")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app).get("/policies").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((p: { id: number }) => p.id === policy.id)).toBe(true)
  })

  it("filters by clientId", async () => {
    const user = await ctx.user("policies-filter")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    const policyA = await ctx.policy({ clientId: client.id })
    await ctx.policy()

    const res = await request(app).get(`/policies?clientId=${client.id}`).set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.map((p: { id: number }) => p.id)).toEqual([policyA.id])
  })
})

describe("GET /policies/:id", () => {
  it("returns a policy with nested client, carrier, and vehicles", async () => {
    const user = await ctx.user("policies-get")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    await ctx.vehicle({ policyId: policy.id })

    const res = await request(app).get(`/policies/${policy.id}`).set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.client.id).toBe(policy.clientId)
    expect(res.body.carrier.id).toBe(policy.carrierId)
    expect(res.body.vehicles).toHaveLength(1)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await ctx.user("policies-404")
    const cookie = await makeSessionCookie(user.id)
    expect((await request(app).get("/policies/999999999").set("Cookie", cookie)).status).toBe(404)
  })
})

describe("POST /policies", () => {
  it("creates a policy", async () => {
    const user = await ctx.user("policies-create")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    const carrier = await ctx.carrier()

    const res = await request(app).post("/policies").set("Cookie", cookie).send({
      clientId: client.id,
      carrierId: carrier.id,
      policyNumber: "TESTPOL-001",
      effectiveDate: "2026-01-01",
      expirationDate: "2027-01-01",
    })
    expect(res.status).toBe(201)
    ctx.track("policy", res.body.id)
  })

  it("returns 409 for a duplicate policy number", async () => {
    const user = await ctx.user("policies-dup")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const client = await ctx.client()
    const carrier = await ctx.carrier()

    const res = await request(app).post("/policies").set("Cookie", cookie).send({
      clientId: client.id,
      carrierId: carrier.id,
      policyNumber: policy.policyNumber,
      effectiveDate: "2026-01-01",
      expirationDate: "2027-01-01",
    })
    expect(res.status).toBe(409)
  })

  it("returns 400 for an invalid effectiveDate", async () => {
    const user = await ctx.user("policies-baddate")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    const carrier = await ctx.carrier()

    const res = await request(app).post("/policies").set("Cookie", cookie).send({
      clientId: client.id,
      carrierId: carrier.id,
      policyNumber: "TESTPOL-002",
      effectiveDate: "not-a-date",
      expirationDate: "2027-01-01",
    })
    expect(res.status).toBe(400)
  })
})

describe("PATCH /policies/:id", () => {
  it("updates a scalar field and returns the detail shape", async () => {
    const user = await ctx.user("policies-update")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy({ status: "pending" })

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({ status: "active" })
    expect(res.status).toBe(200)
    expect(res.body.status).toBe("active")
    expect(res.body.client.id).toBe(policy.clientId)
    expect(res.body.carrier.id).toBe(policy.carrierId)
    expect(res.body.vehicles).toEqual([])
  })

  it("replaces vehicles and drivers when both keys are present", async () => {
    const user = await ctx.user("policies-update-nested")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    await ctx.vehicle({ policyId: policy.id })
    const person = await ctx.person()

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({
        vehicles: [
          {
            vin: "PATCHVIN00000001",
            make: "Ford",
            model: "Focus",
            year: 2019,
            garagingZip: "10001",
          },
        ],
        drivers: [{ kind: "existing", personId: person.id, dlNumber: "PATCH-DL-1" }],
      })

    expect(res.status).toBe(200)
    expect(res.body.vehicles).toHaveLength(1)
    expect(res.body.vehicles[0].vin).toBe("PATCHVIN00000001")
    expect(res.body.policyDrivers).toHaveLength(1)
    expect(res.body.policyDrivers[0].driver.person.id).toBe(person.id)
  })

  it("clears vehicles and drivers when given empty arrays, without deleting the underlying person", async () => {
    const user = await ctx.user("policies-update-clear")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    await ctx.vehicle({ policyId: policy.id })
    const { person } = await ctx.driverLink(policy.id)

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({ vehicles: [], drivers: [] })

    expect(res.status).toBe(200)
    expect(res.body.vehicles).toHaveLength(0)
    expect(res.body.policyDrivers).toHaveLength(0)

    const personCheck = await request(app).get(`/persons/${person.id}`).set("Cookie", cookie)
    expect(personCheck.status).toBe(200)
  })

  it("leaves vehicles untouched when the key is omitted", async () => {
    const user = await ctx.user("policies-update-omit")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const vehicle = await ctx.vehicle({ policyId: policy.id })

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({ status: "active" })

    expect(res.status).toBe(200)
    expect(res.body.vehicles).toHaveLength(1)
    expect(res.body.vehicles[0].id).toBe(vehicle.id)
  })

  it("returns 400 for a duplicate VIN within the payload", async () => {
    const user = await ctx.user("policies-update-dupvin")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({
        vehicles: [
          {
            vin: "PATCHVIN00000002",
            make: "Ford",
            model: "Focus",
            year: 2019,
            garagingZip: "10001",
          },
          {
            vin: "PATCHVIN00000002",
            make: "Ford",
            model: "Focus",
            year: 2019,
            garagingZip: "10001",
          },
        ],
      })
    expect(res.status).toBe(400)
  })

  it("returns 409 when patched policyNumber collides with another policy", async () => {
    const user = await ctx.user("policies-update-dupnum")
    const cookie = await makeSessionCookie(user.id)
    const existing = await ctx.policy()
    const policy = await ctx.policy()

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({ policyNumber: existing.policyNumber })
    expect(res.status).toBe(409)
  })

  it("allows adding a driver without a dlNumber", async () => {
    const user = await ctx.user("policies-update-nodl")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const person = await ctx.person()

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({ drivers: [{ kind: "existing", personId: person.id }] })
    expect(res.status).toBe(200)
    expect(res.body.policyDrivers).toHaveLength(1)
    expect(res.body.policyDrivers[0].driver.dlNumber).toBeNull()
  })

  it("returns 400 when an existing driver spec references an unknown person", async () => {
    const user = await ctx.user("policies-update-baddriver")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app)
      .patch(`/policies/${policy.id}`)
      .set("Cookie", cookie)
      .send({ drivers: [{ kind: "existing", personId: 999999999 }] })
    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown id", async () => {
    const user = await ctx.user("policies-update-404")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .patch("/policies/999999999")
      .set("Cookie", cookie)
      .send({ status: "active" })
    expect(res.status).toBe(404)
  })
})

describe("DELETE /policies/:id", () => {
  it("rejects staff with 403", async () => {
    const user = await ctx.user("policies-del-staff", "staff")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    expect((await request(app).delete(`/policies/${policy.id}`).set("Cookie", cookie)).status).toBe(
      403
    )
  })

  it("allows admins and cascades vehicles", async () => {
    const user = await ctx.user("policies-del-admin", "admin")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const vehicle = await ctx.vehicle({ policyId: policy.id })

    expect((await request(app).delete(`/policies/${policy.id}`).set("Cookie", cookie)).status).toBe(
      204
    )

    const check = await request(app).get(`/vehicles/${vehicle.id}`).set("Cookie", cookie)
    expect(check.status).toBe(404)
  })
})

describe("GET /policies?q=", () => {
  it("finds a policy by partial policy number", async () => {
    const user = await ctx.user("policies-search")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy({ policyNumber: "UNIQ-SEARCHABLE-77" })

    const res = await request(app).get("/policies?q=SEARCHABLE-77").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.some((p: { id: number }) => p.id === policy.id)).toBe(true)
  })

  it("returns 400 when q is too short", async () => {
    const user = await ctx.user("policies-search-short")
    const cookie = await makeSessionCookie(user.id)

    expect((await request(app).get("/policies?q=a").set("Cookie", cookie)).status).toBe(400)
  })
})
