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

describe("GET /users", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/users")).status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const staff = await ctx.user("list-users-staff", "staff")
    const cookie = await makeSessionCookie(staff.id)

    expect((await request(app).get("/users").set("Cookie", cookie)).status).toBe(403)
  })

  it("lists users without exposing googleSub", async () => {
    const admin = await ctx.user("list-users-admin", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app).get("/users").set("Cookie", cookie)
    expect(res.status).toBe(200)

    const row = res.body.find((u: { id: number }) => u.id === admin.id)
    expect(row).toMatchObject({ email: admin.email, role: "admin", isActive: true })
    expect(row.hasSignedIn).toBe(false)
    expect(row).not.toHaveProperty("googleSub")
  })
})

describe("PATCH /users/:id", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).patch("/users/1").send({ name: "X" })).status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const staff = await ctx.user("patch-user-staff", "staff")
    const target = await ctx.user("patch-user-target", "staff")
    const cookie = await makeSessionCookie(staff.id)

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ name: "Renamed" })
    expect(res.status).toBe(403)
  })

  it("returns 404 for an unknown id", async () => {
    const admin = await ctx.user("patch-user-404", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch("/users/999999999")
      .set("Cookie", cookie)
      .send({ name: "Nobody" })
    expect(res.status).toBe(404)
  })

  it("returns 400 for an invalid role", async () => {
    const admin = await ctx.user("patch-user-badrole", "admin")
    const target = await ctx.user("patch-user-badrole-target", "staff")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ role: "owner" })
    expect(res.status).toBe(400)
  })

  it("renames a user and changes their role", async () => {
    const admin = await ctx.user("patch-user-admin", "admin")
    const target = await ctx.user("patch-user-promote", "staff")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ name: "Promoted Person", role: "admin" })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ id: target.id, name: "Promoted Person", role: "admin" })
  })

  it("disabling a user drops their live sessions", async () => {
    const admin = await ctx.user("patch-user-disabler", "admin")
    const target = await ctx.user("patch-user-disabled", "staff")
    const adminCookie = await makeSessionCookie(admin.id)
    const targetCookie = await makeSessionCookie(target.id)

    expect((await request(app).get("/auth/me").set("Cookie", targetCookie)).status).toBe(200)

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", adminCookie)
      .send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)

    // The session row is gone, so this is a 401 (unknown session) rather than
    // the 403 requireAuth would return for a disabled user with a live one.
    expect((await request(app).get("/auth/me").set("Cookie", targetCookie)).status).toBe(401)
  })

  it("re-enables a disabled user", async () => {
    const admin = await ctx.user("patch-user-enabler", "admin")
    const target = await ctx.user("patch-user-enable", "staff")
    const cookie = await makeSessionCookie(admin.id)

    await request(app).patch(`/users/${target.id}`).set("Cookie", cookie).send({ isActive: false })
    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ isActive: true })

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(true)
  })

  it("refuses to let an admin change their own role", async () => {
    const admin = await ctx.user("patch-self-role", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Cookie", cookie)
      .send({ role: "staff" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("You cannot change your own role")
  })

  it("refuses to let an admin disable their own account", async () => {
    const admin = await ctx.user("patch-self-disable", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Cookie", cookie)
      .send({ isActive: false })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("You cannot disable your own account")
  })

  // The self-guards above are the whole of the "don't lock yourself out"
  // rule: the actor is always an active admin and can only change someone
  // else, so an active admin always survives. Demoting a second admin is
  // therefore allowed.
  it("allows an admin to demote another admin", async () => {
    const admin = await ctx.user("patch-demoter", "admin")
    const other = await ctx.user("patch-demoted", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch(`/users/${other.id}`)
      .set("Cookie", cookie)
      .send({ role: "staff" })

    expect(res.status).toBe(200)
    expect(res.body.role).toBe("staff")
  })

  it("allows an admin to disable another admin", async () => {
    const admin = await ctx.user("patch-admin-disabler", "admin")
    const other = await ctx.user("patch-admin-disabled", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch(`/users/${other.id}`)
      .set("Cookie", cookie)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
  })

  it("allows an admin to rename themselves", async () => {
    const admin = await ctx.user("patch-self-name", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Cookie", cookie)
      .send({ name: "My New Name", role: "admin" })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("My New Name")
  })
})

describe("POST /users/:id/resend-welcome", () => {
  it("returns 403 for a non-admin user", async () => {
    const staff = await ctx.user("resend-staff", "staff")
    const target = await ctx.user("resend-staff-target", "staff")
    const cookie = await makeSessionCookie(staff.id)

    const res = await request(app)
      .post(`/users/${target.id}/resend-welcome`)
      .set("Cookie", cookie)
      .send()
    expect(res.status).toBe(403)
  })

  it("returns 404 for an unknown id", async () => {
    const admin = await ctx.user("resend-404", "admin")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .post("/users/999999999/resend-welcome")
      .set("Cookie", cookie)
      .send()
    expect(res.status).toBe(404)
  })

  it("re-sends the welcome email", async () => {
    configureMail()
    const admin = await ctx.user("resend-admin", "admin")
    const target = await ctx.user("resend-target", "staff")
    const cookie = await makeSessionCookie(admin.id)
    const fetchMock = stubResend({ id: "msg_resend" })

    const res = await request(app)
      .post(`/users/${target.id}/resend-welcome`)
      .set("Cookie", cookie)
      .send()

    expect(res.status).toBe(200)
    expect(res.body.email).toEqual({ status: "sent", resendId: "msg_resend" })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [logRow] = await db.select().from(emailLog).where(eq(emailLog.recipient, target.email))
    expect(logRow.status).toBe("sent")
    expect(logRow.triggeredBy).toBe(admin.id)
  })

  it("reports a failed email rather than throwing when mail isn't configured", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    const admin = await ctx.user("resend-unconfigured", "admin")
    const target = await ctx.user("resend-unconfigured-target", "staff")
    const cookie = await makeSessionCookie(admin.id)

    const res = await request(app)
      .post(`/users/${target.id}/resend-welcome`)
      .set("Cookie", cookie)
      .send()

    expect(res.status).toBe(200)
    expect(res.body.email.status).toBe("failed")
  })
})
