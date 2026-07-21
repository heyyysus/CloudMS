import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

describe("GET /policy-logs", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/policy-logs?policyId=1")).status).toBe(401)
  })

  it("returns 400 without a policyId", async () => {
    const user = await ctx.user("logs-list-nopolicyid")
    const cookie = await makeSessionCookie(user.id)
    expect((await request(app).get("/policy-logs").set("Cookie", cookie)).status).toBe(400)
  })

  it("returns 400 for a non-numeric policyId", async () => {
    const user = await ctx.user("logs-list-badpolicyid")
    const cookie = await makeSessionCookie(user.id)
    expect((await request(app).get("/policy-logs?policyId=abc").set("Cookie", cookie)).status).toBe(
      400
    )
  })

  it("lists a policy's logs newest-first with author info, scoped to that policy", async () => {
    const user = await ctx.user("logs-list")
    const cookie = await makeSessionCookie(user.id)
    const policyA = await ctx.policy()
    const policyB = await ctx.policy()
    const first = await ctx.log(policyA.id, user.id, "First note")
    const second = await ctx.log(policyA.id, user.id, "Second note")
    await ctx.log(policyB.id, user.id, "Other policy's note")

    const res = await request(app).get(`/policy-logs?policyId=${policyA.id}`).set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
    expect(res.body.map((l: { id: number }) => l.id)).toEqual([second.id, first.id])
    expect(res.body[0].logNumber).toBe(2)
    expect(res.body[1].logNumber).toBe(1)
    expect(res.body[0].author).toMatchObject({ id: user.id, email: user.email })
  })
})

describe("POST /policy-logs", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).post("/policy-logs").send({ policyId: 1, body: "x" })).status).toBe(
      401
    )
  })

  it("creates a log, starting log numbers at 1 and stamping the session user as author", async () => {
    const user = await ctx.user("logs-create")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app)
      .post("/policy-logs")
      .set("Cookie", cookie)
      .send({ policyId: policy.id, body: "Called the client back." })
    expect(res.status).toBe(201)
    expect(res.body.logNumber).toBe(1)
    expect(res.body.policyId).toBe(policy.id)
    expect(res.body.body).toBe("Called the client back.")
    expect(res.body.author.id).toBe(user.id)
    expect(res.body.createdAt).toBeTruthy()
  })

  it("increments the log number per policy and keeps counters independent across policies", async () => {
    const user = await ctx.user("logs-increment")
    const cookie = await makeSessionCookie(user.id)
    const policyA = await ctx.policy()
    const policyB = await ctx.policy()

    const a1 = await request(app)
      .post("/policy-logs")
      .set("Cookie", cookie)
      .send({ policyId: policyA.id, body: "A1" })
    const a2 = await request(app)
      .post("/policy-logs")
      .set("Cookie", cookie)
      .send({ policyId: policyA.id, body: "A2" })
    const b1 = await request(app)
      .post("/policy-logs")
      .set("Cookie", cookie)
      .send({ policyId: policyB.id, body: "B1" })

    expect(a1.body.logNumber).toBe(1)
    expect(a2.body.logNumber).toBe(2)
    expect(b1.body.logNumber).toBe(1)
  })

  it("allows staff (no admin restriction)", async () => {
    const user = await ctx.user("logs-create-staff", "staff")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    expect(
      (
        await request(app)
          .post("/policy-logs")
          .set("Cookie", cookie)
          .send({ policyId: policy.id, body: "Staff note" })
      ).status
    ).toBe(201)
  })

  it("returns 400 for an empty body", async () => {
    const user = await ctx.user("logs-empty-body")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    expect(
      (
        await request(app)
          .post("/policy-logs")
          .set("Cookie", cookie)
          .send({ policyId: policy.id, body: "" })
      ).status
    ).toBe(400)
  })

  it("returns 400 for a missing policyId", async () => {
    const user = await ctx.user("logs-missing-policyid")
    const cookie = await makeSessionCookie(user.id)

    expect(
      (await request(app).post("/policy-logs").set("Cookie", cookie).send({ body: "x" })).status
    ).toBe(400)
  })

  it("returns 404 for a nonexistent policy", async () => {
    const user = await ctx.user("logs-404-policy")
    const cookie = await makeSessionCookie(user.id)

    expect(
      (
        await request(app)
          .post("/policy-logs")
          .set("Cookie", cookie)
          .send({ policyId: 999999999, body: "x" })
      ).status
    ).toBe(404)
  })

  it("ignores a client-supplied logNumber or authorId", async () => {
    const user = await ctx.user("logs-ignore-clientfields")
    const otherUser = await ctx.user("logs-ignore-clientfields-other")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()

    const res = await request(app)
      .post("/policy-logs")
      .set("Cookie", cookie)
      .send({ policyId: policy.id, body: "x", logNumber: 99, authorId: otherUser.id })
    expect(res.status).toBe(201)
    expect(res.body.logNumber).toBe(1)
    expect(res.body.author.id).toBe(user.id)
  })
})

describe("immutability", () => {
  it("has no PATCH or DELETE route for a log", async () => {
    const user = await ctx.user("logs-immutable")
    const cookie = await makeSessionCookie(user.id)
    const policy = await ctx.policy()
    const log = await ctx.log(policy.id, user.id)

    expect(
      (await request(app).patch(`/policy-logs/${log.id}`).set("Cookie", cookie).send({ body: "x" }))
        .status
    ).toBe(404)
    expect((await request(app).delete(`/policy-logs/${log.id}`).set("Cookie", cookie)).status).toBe(
      404
    )
  })
})
