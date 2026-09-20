import { eq } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { emailLog, users } from "../db/schema"
import { createMembership, findMembership, softDeleteUser } from "../repositories"
import { makeTestUser, MISSING_ROW_ID, TestContext } from "./testHelpers"

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
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: "nobody@example.com" })

    expect(res.status).toBe(403)
  })

  it("returns 400 for an invalid email", async () => {
    const admin = await ctx.user("invite-badmail", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: "not-an-email" })

    expect(res.status).toBe(400)
  })

  it("returns 400 for an invalid role", async () => {
    const admin = await ctx.user("invite-badrole", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: "someone@example.com", role: "owner" })

    expect(res.status).toBe(400)
  })

  it("returns 409 when inviting an email that is already an active member", async () => {
    const admin = await ctx.user("invite-dupe-admin", "admin")
    const existing = await ctx.user("invite-dupe-existing", "staff")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: existing.email })

    expect(res.status).toBe(409)
    expect(res.body.error).toBe("This user is already a member of this organization")
  })

  it("adds a membership rather than a duplicate users row for an existing live user", async () => {
    const admin = await ctx.user("invite-existing-admin", "admin")
    const cookie = await ctx.cookie(admin.id)
    // A user who exists (e.g. a member of some other org) but has no
    // membership in this admin's org yet.
    const existing = await makeTestUser("invite-existing-user")
    ctx.track("user", existing.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: existing.email, role: "staff" })

    expect(res.status).toBe(201)
    expect(res.body.user.id).toBe(existing.id)
    expect(res.body.user.role).toBe("staff")

    const rows = await db.select().from(users).where(eq(users.email, existing.email))
    expect(rows).toHaveLength(1)
  })

  it("creates the user and sends the welcome email", async () => {
    configureMail()
    const admin = await ctx.user("invite-admin", "admin")
    const cookie = await ctx.cookie(admin.id)
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
    const cookie = await ctx.cookie(admin.id)
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
    const cookie = await ctx.cookie(admin.id)
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
    const cookie = await ctx.cookie(staff.id)

    expect((await request(app).get("/users").set("Cookie", cookie)).status).toBe(403)
  })

  it("lists users without exposing googleSub", async () => {
    const admin = await ctx.user("list-users-admin", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app).get("/users").set("Cookie", cookie)
    expect(res.status).toBe(200)

    const row = res.body.find((u: { id: number }) => u.id === admin.id)
    expect(row).toMatchObject({ email: admin.email, role: "admin", isActive: true })
    expect(row.hasSignedIn).toBe(false)
    expect(row).not.toHaveProperty("googleSub")
  })

  it("only lists members of the caller's own org", async () => {
    const admin = await ctx.user("list-org-scope-admin", "admin")
    const cookie = await ctx.cookie(admin.id)

    const otherOrg = await ctx.org()
    const otherOrgMember = await ctx.user("list-org-scope-other", "staff", otherOrg.id)

    const res = await request(app).get("/users").set("Cookie", cookie)
    expect(res.status).toBe(200)
    const ids = res.body.map((u: { id: number }) => u.id)
    expect(ids).toContain(admin.id)
    expect(ids).not.toContain(otherOrgMember.id)
  })
})

describe("PATCH /users/:id", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).patch("/users/1").send({ name: "X" })).status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const staff = await ctx.user("patch-user-staff", "staff")
    const target = await ctx.user("patch-user-target", "staff")
    const cookie = await ctx.cookie(staff.id)

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ name: "Renamed" })
    expect(res.status).toBe(403)
  })

  it("returns 404 for an unknown id", async () => {
    const admin = await ctx.user("patch-user-404", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .patch(`/users/${MISSING_ROW_ID}`)
      .set("Cookie", cookie)
      .send({ name: "Nobody" })
    expect(res.status).toBe(404)
  })

  it("returns 400 for an invalid role", async () => {
    const admin = await ctx.user("patch-user-badrole", "admin")
    const target = await ctx.user("patch-user-badrole-target", "staff")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ role: "owner" })
    expect(res.status).toBe(400)
  })

  it("renames a user and changes their role", async () => {
    const admin = await ctx.user("patch-user-admin", "admin")
    const target = await ctx.user("patch-user-promote", "staff")
    const cookie = await ctx.cookie(admin.id)

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
    const adminCookie = await ctx.cookie(admin.id)
    const targetCookie = await ctx.cookie(target.id)

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
    const cookie = await ctx.cookie(admin.id)

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
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Cookie", cookie)
      .send({ role: "staff" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("You cannot change your own role")
  })

  it("refuses to let an admin disable their own account", async () => {
    const admin = await ctx.user("patch-self-disable", "admin")
    const cookie = await ctx.cookie(admin.id)

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
    const cookie = await ctx.cookie(admin.id)

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
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .patch(`/users/${other.id}`)
      .set("Cookie", cookie)
      .send({ isActive: false })

    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)
  })

  it("allows an admin to rename themselves", async () => {
    const admin = await ctx.user("patch-self-name", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Cookie", cookie)
      .send({ name: "My New Name", role: "admin" })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe("My New Name")
  })

  it("changes the membership role only in the caller's org, leaving another org's untouched", async () => {
    const admin = await ctx.user("patch-cross-org-admin", "admin")
    const cookie = await ctx.cookie(admin.id)
    const target = await ctx.user("patch-cross-org-target", "staff")

    const otherOrg = await ctx.org()
    const otherMembership = await createMembership({
      userId: target.id,
      orgId: otherOrg.id,
      role: "staff",
    })

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ role: "admin" })
    expect(res.status).toBe(200)
    expect(res.body.role).toBe("admin")

    const otherOrgMembership = await findMembership(target.id, otherOrg.id)
    expect(otherOrgMembership?.role).toBe("staff")
    expect(otherOrgMembership?.id).toBe(otherMembership.id)
  })

  it("disabling a user in one org leaves their session in another org alive", async () => {
    const admin = await ctx.user("patch-multi-org-admin", "admin")
    const adminCookie = await ctx.cookie(admin.id)
    const target = await ctx.user("patch-multi-org-target", "staff")
    const targetCookieInAdminOrg = await ctx.cookie(target.id)

    const otherOrg = await ctx.org()
    await createMembership({ userId: target.id, orgId: otherOrg.id, role: "staff" })
    const targetCookieInOtherOrg = await ctx.cookie(target.id, otherOrg.id)

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", adminCookie)
      .send({ isActive: false })
    expect(res.status).toBe(200)

    expect((await request(app).get("/auth/me").set("Cookie", targetCookieInAdminOrg)).status).toBe(
      401
    )
    expect((await request(app).get("/auth/me").set("Cookie", targetCookieInOtherOrg)).status).toBe(
      200
    )
  })
})

describe("POST /users/:id/resend-welcome", () => {
  it("returns 403 for a non-admin user", async () => {
    const staff = await ctx.user("resend-staff", "staff")
    const target = await ctx.user("resend-staff-target", "staff")
    const cookie = await ctx.cookie(staff.id)

    const res = await request(app)
      .post(`/users/${target.id}/resend-welcome`)
      .set("Cookie", cookie)
      .send()
    expect(res.status).toBe(403)
  })

  it("returns 404 for an unknown id", async () => {
    const admin = await ctx.user("resend-404", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .post(`/users/${MISSING_ROW_ID}/resend-welcome`)
      .set("Cookie", cookie)
      .send()
    expect(res.status).toBe(404)
  })

  it("re-sends the welcome email", async () => {
    configureMail()
    const admin = await ctx.user("resend-admin", "admin")
    const target = await ctx.user("resend-target", "staff")
    const cookie = await ctx.cookie(admin.id)
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
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app)
      .post(`/users/${target.id}/resend-welcome`)
      .set("Cookie", cookie)
      .send()

    expect(res.status).toBe(200)
    expect(res.body.email.status).toBe("failed")
  })
})

describe("DELETE /users/:id", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).delete("/users/1")).status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const staff = await ctx.user("delete-user-staff", "staff")
    const target = await ctx.user("delete-user-staff-target", "staff")
    const cookie = await ctx.cookie(staff.id)

    const res = await request(app).delete(`/users/${target.id}`).set("Cookie", cookie)
    expect(res.status).toBe(403)
  })

  it("returns 404 for an unknown id", async () => {
    const admin = await ctx.user("delete-user-404", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app).delete(`/users/${MISSING_ROW_ID}`).set("Cookie", cookie)
    expect(res.status).toBe(404)
  })

  it("refuses to let an admin delete their own account", async () => {
    const admin = await ctx.user("delete-self", "admin")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app).delete(`/users/${admin.id}`).set("Cookie", cookie)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("You cannot delete your own account")
  })

  it("deletes a user: deactivates their membership, drops their sessions, but keeps the row", async () => {
    const admin = await ctx.user("delete-user-admin", "admin")
    const target = await ctx.user("delete-user-target", "staff")
    const adminCookie = await ctx.cookie(admin.id)
    const targetCookie = await ctx.cookie(target.id)

    const res = await request(app).delete(`/users/${target.id}`).set("Cookie", adminCookie)
    expect(res.status).toBe(204)

    // Still listed for the admin, now flagged disabled in this org...
    const list = await request(app).get("/users").set("Cookie", adminCookie)
    const row = list.body.find((u: { id: number }) => u.id === target.id)
    expect(row.isActive).toBe(false)

    // ...and logged out immediately...
    expect((await request(app).get("/auth/me").set("Cookie", targetCookie)).status).toBe(401)

    // ...but the row itself, and its history, still exist - this is not the
    // platform-level soft delete.
    const [userRow] = await db.select().from(users).where(eq(users.id, target.id))
    expect(userRow).toBeDefined()
    expect(userRow.deletedAt).toBeNull()
  })

  it("deactivating an already-deactivated membership is a no-op, not a 404", async () => {
    const admin = await ctx.user("delete-user-twice-admin", "admin")
    const target = await ctx.user("delete-user-twice-target", "staff")
    const cookie = await ctx.cookie(admin.id)

    await request(app).delete(`/users/${target.id}`).set("Cookie", cookie)
    const res = await request(app).delete(`/users/${target.id}`).set("Cookie", cookie)
    expect(res.status).toBe(204)
  })

  it("returns 404 for DELETE on a user with no membership in the caller's org", async () => {
    const admin = await ctx.user("delete-no-membership-admin", "admin")
    const cookie = await ctx.cookie(admin.id)
    // Exists (has a membership elsewhere) but not in this admin's org.
    const otherOrg = await ctx.org()
    const target = await ctx.user("delete-no-membership-target", "staff", otherOrg.id)

    const res = await request(app).delete(`/users/${target.id}`).set("Cookie", cookie)
    expect(res.status).toBe(404)
  })

  it("re-activates a deactivated membership via PATCH isActive: true", async () => {
    const admin = await ctx.user("delete-then-patch-admin", "admin")
    const target = await ctx.user("delete-then-patch-target", "staff")
    const cookie = await ctx.cookie(admin.id)

    await request(app).delete(`/users/${target.id}`).set("Cookie", cookie)
    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", cookie)
      .send({ isActive: true })
    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(true)
  })

  it("offers the automation user's own email a 409, not a delete", async () => {
    // The automation user is excluded from listUsers, but the route itself is
    // the real guard - this checks that guard directly rather than trusting
    // the list filter alone.
    const admin = await ctx.user("delete-automation-admin", "admin")
    const cookie = await ctx.cookie(admin.id)
    const [automation] = await db
      .select()
      .from(users)
      .where(eq(users.email, "automation@cloudms.local"))

    const res = await request(app).delete(`/users/${automation.id}`).set("Cookie", cookie)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("This account cannot be deleted")
  })
})

describe("re-inviting a deactivated member's email", () => {
  it("reactivates the membership rather than creating a duplicate", async () => {
    const admin = await ctx.user("reinvite-admin", "admin")
    const target = await ctx.user("reinvite-target", "staff")
    const cookie = await ctx.cookie(admin.id)

    await request(app).delete(`/users/${target.id}`).set("Cookie", cookie)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: target.email, role: "admin" })

    expect(res.status).toBe(201)
    expect(res.body.user.id).toBe(target.id)
    expect(res.body.user.role).toBe("admin")
    expect(res.body.user.isActive).toBe(true)

    const rows = await db.select().from(users).where(eq(users.email, target.email))
    expect(rows).toHaveLength(1)
  })

  it("returns 409 with the deleted user's id for a platform-level soft-deleted email", async () => {
    const admin = await ctx.user("reinvite-platform-admin", "admin")
    const target = await ctx.user("reinvite-platform-target", "staff")
    const cookie = await ctx.cookie(admin.id)

    // Platform-level soft delete isn't reachable through any route in this
    // sub-issue (see softDeleteUser) - exercised directly here.
    await softDeleteUser(target.id, admin.id)

    const res = await request(app)
      .post("/users/invite")
      .set("Cookie", cookie)
      .send({ email: target.email })

    expect(res.status).toBe(409)
    expect(res.body.deletedUserId).toBe(target.id)
  })
})

describe("POST /users/:id/restore", () => {
  it("returns 404 for a user that was never deleted", async () => {
    const admin = await ctx.user("restore-not-deleted-admin", "admin")
    const target = await ctx.user("restore-not-deleted-target", "staff")
    const cookie = await ctx.cookie(admin.id)

    const res = await request(app).post(`/users/${target.id}/restore`).set("Cookie", cookie)
    expect(res.status).toBe(404)
  })

  it("brings a platform-level soft-deleted user back, active and visible again", async () => {
    configureMail()
    const admin = await ctx.user("restore-admin", "admin")
    const target = await ctx.user("restore-target", "staff")
    const cookie = await ctx.cookie(admin.id)
    stubResend({ id: "msg_restore" })

    // Not reachable through DELETE /users/:id in this sub-issue (that only
    // deactivates the org membership) - exercised directly, same as the
    // platform-level re-invite case above.
    await softDeleteUser(target.id, admin.id)

    const res = await request(app).post(`/users/${target.id}/restore`).set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.user.isActive).toBe(true)
    expect(res.body.user).not.toHaveProperty("deletedAt")

    const list = await request(app).get("/users").set("Cookie", cookie)
    expect(list.body.map((u: { id: number }) => u.id)).toContain(target.id)
  })
})
