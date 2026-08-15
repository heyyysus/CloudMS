import { eq } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { emailLog } from "../db/schema"
import { makeSessionCookie, makeTestUser, TestContext } from "./testHelpers"

const ctx = new TestContext()

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
  return ctx.cleanup()
})

function configureMail() {
  process.env.RESEND_API_KEY = "re_test"
  process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
}

function stubResend(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, _requestInit?: RequestInit) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("POST /users/invite", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).post("/users/invite").send({ email: "nobody@example.com" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const admin = await ctx.user("invite-staff", "staff")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: "nobody@example.com" })

    expect(res.status).toBe(403)
  })

  it("returns 400 for an invalid email", async () => {
    const admin = await ctx.user("invite-badmail", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: "not-an-email" })

    expect(res.status).toBe(400)
  })

  it("returns 400 for an invalid role", async () => {
    const admin = await ctx.user("invite-badrole", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: "someone@example.com", role: "owner" })

    expect(res.status).toBe(400)
  })

  it("returns 409 when a user with that email already exists", async () => {
    const admin = await ctx.user("invite-dupe-admin", "admin")
    const cookie = await makeSessionCookie(admin.id)
    const existing = await makeTestUser("invite-dupe-existing")

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: existing.email })

    expect(res.status).toBe(409)
    ctx.track("user", existing.id)
  })

  it("creates the user and sends the welcome email", async () => {
    configureMail()
    const admin = await ctx.user("invite-admin", "admin")
    const cookie = await makeSessionCookie(admin.id)
    const fetchMock = stubResend({ id: "msg_1" })
    const email = `invitee-${Date.now()}@example.com`

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email, name: "Invitee Person", role: "staff" })

    expect(res.status).toBe(201)
    expect(res.body.user.email).toBe(email)
    expect(res.body.user.role).toBe("staff")
    expect(res.body.email).toEqual({ status: "sent", resendId: "msg_1" })
    ctx.track("user", res.body.user.id)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(requestBody.subject).not.toContain("{{")
    expect(requestBody.text).not.toContain("{{")
    expect(requestBody.text).toContain("Invitee Person")
    expect(requestBody.text).toContain(admin.email)

    const [logRow] = await db.select().from(emailLog).where(eq(emailLog.recipient, email))
    expect(logRow.status).toBe("sent")
    expect(logRow.resendId).toBe("msg_1")
    expect(logRow.triggeredBy).toBe(admin.id)
  })

  it("still creates the user when mail isn't configured, reporting a failed email", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    const admin = await ctx.user("invite-unconfigured", "admin")
    const cookie = await makeSessionCookie(admin.id)
    const email = `invitee-unconfigured-${Date.now()}@example.com`

    const res = await request(app).post("/users/invite").set("Cookie", cookie).send({ email })

    expect(res.status).toBe(201)
    expect(res.body.email.status).toBe("failed")
    ctx.track("user", res.body.user.id)

    const [logRow] = await db.select().from(emailLog).where(eq(emailLog.recipient, email))
    expect(logRow.status).toBe("failed")
  })

  it("still creates the user when Resend errors, reporting a failed email", async () => {
    configureMail()
    const admin = await ctx.user("invite-5xx", "admin")
    const cookie = await makeSessionCookie(admin.id)
    stubResend(
      { name: "rate_limit_exceeded", message: "Too many requests." },
      { ok: false, status: 429 }
    )
    const email = `invitee-5xx-${Date.now()}@example.com`

    const res = await request(app).post("/users/invite").set("Cookie", cookie).send({ email })

    expect(res.status).toBe(201)
    expect(res.body.email.status).toBe("failed")
    ctx.track("user", res.body.user.id)
  })
})
