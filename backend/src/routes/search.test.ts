import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

describe("GET /search", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/search?q=test")).status).toBe(401)
  })

  it("returns 400 when q is too short", async () => {
    const user = await ctx.user("search-short")
    const cookie = await makeSessionCookie(user.id)
    expect((await request(app).get("/search?q=a").set("Cookie", cookie)).status).toBe(400)
  })

  it("returns matching clients and policies grouped together", async () => {
    const user = await ctx.user("search-grouped")
    const cookie = await makeSessionCookie(user.id)
    const person = await ctx.person({ firstName: "Search", lastName: "Grouped99" })
    const client = await ctx.client({ namedInsuredId: person.id })
    const policy = await ctx.policy({ clientId: client.id, policyNumber: "GROUPED99-POL" })

    const byName = await request(app).get("/search?q=Grouped99").set("Cookie", cookie)
    expect(byName.status).toBe(200)
    expect(byName.body.clients.some((c: { id: number }) => c.id === client.id)).toBe(true)

    const byPolicy = await request(app).get("/search?q=GROUPED99-POL").set("Cookie", cookie)
    expect(byPolicy.body.policies.some((p: { id: number }) => p.id === policy.id)).toBe(true)
  })

  it("matches a client by mailing city split across address fields", async () => {
    const user = await ctx.user("search-client-city")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client({
      mailingAddress1: "1 Test St",
      mailingCity: "Hoosville77",
      mailingState: "CA",
      mailingZip: "98332",
    })

    const res = await request(app).get("/search?q=Hoosville77").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.clients.some((c: { id: number }) => c.id === client.id)).toBe(true)
  })

  it("matches a policy by its city and zip", async () => {
    const user = await ctx.user("search-policy-city")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy({
      policyAddress1: "123 Main St",
      policyCity: "Springvale77",
      policyState: "IL",
      policyZip: "62799",
    })

    const byCity = await request(app).get("/search?q=Springvale77").set("Cookie", cookie)
    expect(byCity.body.policies.some((p: { id: number }) => p.id === policy.id)).toBe(true)

    const byZip = await request(app).get("/search?q=62799").set("Cookie", cookie)
    expect(byZip.body.policies.some((p: { id: number }) => p.id === policy.id)).toBe(true)
  })

  it("escapes % and _ so they are not treated as wildcards", async () => {
    const user = await ctx.user("search-escape")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy({ policyNumber: "ESC_98%TEST" })

    const literalMatch = await request(app).get("/search?q=ESC_98%25TEST").set("Cookie", cookie)
    expect(literalMatch.body.policies.some((p: { id: number }) => p.id === policy.id)).toBe(true)

    const wildcardAttempt = await request(app).get("/search?q=ESCX98YTEST").set("Cookie", cookie)
    expect(wildcardAttempt.body.policies.some((p: { id: number }) => p.id === policy.id)).toBe(
      false
    )
  })
})
