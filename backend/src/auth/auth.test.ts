import express from "express"
import cookieParser from "cookie-parser"
import { eq, like } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { orgMemberships, users } from "../db/schema"
import {
  createMembership,
  createSession,
  createUser,
  findSessionWithUserByTokenHash,
  findUserByEmail,
} from "../repositories"
import { TestContext } from "../routes/testHelpers"
import type { User } from "../types"
import { verifyGoogleIdToken } from "./google"
import { requireAuth, requireRole } from "./middleware"
import { generateSessionToken, hashToken } from "./tokens"

vi.mock("./google", () => ({
  verifyGoogleIdToken: vi.fn(),
}))

const mockVerify = vi.mocked(verifyGoogleIdToken)

const testEmailPrefix = "auth-test-"

const ctx = new TestContext()

function makeUser(suffix: string, overrides: Partial<User> = {}) {
  return createUser({ email: `${testEmailPrefix}${suffix}@example.com`, ...overrides })
}

async function makeSessionCookie(userId: string, opts: { orgId?: string; expiresAt?: Date } = {}) {
  const token = generateSessionToken()
  await createSession({
    userId,
    orgId: opts.orgId ?? null,
    tokenHash: hashToken(token),
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
  })
  return `session=${token}`
}

function cookieToken(cookie: string): string {
  const match = /session=([^;]+)/.exec(cookie)
  if (!match) throw new Error(`Not a session cookie: ${cookie}`)
  return match[1]
}

afterEach(async () => {
  vi.clearAllMocks()
  await db.delete(users).where(like(users.email, `${testEmailPrefix}%`))
  await ctx.cleanup()
})

describe("POST /auth/google", () => {
  it("logs in a user with one active membership and binds the session to it", async () => {
    const user = await makeUser("login")
    const org = await ctx.org()
    await createMembership({ userId: user.id, orgId: org.id, role: "staff" })
    mockVerify.mockResolvedValue({ email: user.email, sub: "google-sub-1", name: "Test User" })

    const res = await request(app).post("/auth/google").send({ idToken: "valid" })

    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({
      id: user.id,
      email: user.email,
      name: "Test User",
      role: "staff",
      isPlatformOwner: false,
    })
    expect(res.body.org).toMatchObject({ id: org.id, name: org.name, slug: org.slug })
    expect(res.body.memberships).toHaveLength(1)
    const cookie = res.headers["set-cookie"]?.[0]
    expect(cookie).toContain("session=")
    expect(cookie).toContain("HttpOnly")

    const updated = await findUserByEmail(user.email)
    expect(updated?.googleSub).toBe("google-sub-1")

    const row = await findSessionWithUserByTokenHash(hashToken(cookieToken(cookie)))
    expect(row?.session.orgId).toBe(org.id)
  })

  it("leaves the session unbound and lists every org when the user has two active memberships", async () => {
    const user = await makeUser("multi-org")
    const orgA = await ctx.org()
    const orgB = await ctx.org()
    await createMembership({ userId: user.id, orgId: orgA.id, role: "staff" })
    await createMembership({ userId: user.id, orgId: orgB.id, role: "admin" })
    mockVerify.mockResolvedValue({ email: user.email, sub: "google-sub-multi" })

    const res = await request(app).post("/auth/google").send({ idToken: "valid" })

    expect(res.status).toBe(200)
    expect(res.body.user.role).toBeNull()
    expect(res.body.org).toBeNull()
    expect(res.body.memberships).toHaveLength(2)

    const cookie = res.headers["set-cookie"]?.[0]
    const row = await findSessionWithUserByTokenHash(hashToken(cookieToken(cookie)))
    expect(row?.session.orgId).toBeNull()
  })

  it("rejects a user with no active memberships with 403", async () => {
    const user = await makeUser("no-membership")
    mockVerify.mockResolvedValue({ email: user.email, sub: "s" })

    const res = await request(app).post("/auth/google").send({ idToken: "valid" })
    expect(res.status).toBe(403)
  })

  it("does not count an inactive membership", async () => {
    const user = await makeUser("inactive-membership")
    const org = await ctx.org()
    const membership = await createMembership({ userId: user.id, orgId: org.id, role: "staff" })
    await db
      .update(orgMemberships)
      .set({ isActive: false })
      .where(eq(orgMemberships.id, membership.id))
    mockVerify.mockResolvedValue({ email: user.email, sub: "s" })

    const res = await request(app).post("/auth/google").send({ idToken: "valid" })
    expect(res.status).toBe(403)
  })

  it("rejects a missing idToken with 400", async () => {
    const res = await request(app).post("/auth/google").send({})
    expect(res.status).toBe(400)
  })

  it("rejects an invalid Google token with 401", async () => {
    mockVerify.mockRejectedValue(new Error("bad token"))
    const res = await request(app).post("/auth/google").send({ idToken: "bad" })
    expect(res.status).toBe(401)
  })

  it("rejects an email with no user row with 403", async () => {
    mockVerify.mockResolvedValue({ email: `${testEmailPrefix}stranger@example.com`, sub: "s" })
    const res = await request(app).post("/auth/google").send({ idToken: "valid" })
    expect(res.status).toBe(403)
  })

  it("rejects an inactive user with 403", async () => {
    const user = await makeUser("inactive", { isActive: false })
    mockVerify.mockResolvedValue({ email: user.email, sub: "s" })
    const res = await request(app).post("/auth/google").send({ idToken: "valid" })
    expect(res.status).toBe(403)
  })

  it("rejects a Google sub that does not match the stored one with 403", async () => {
    const user = await makeUser("submismatch", { googleSub: "original-sub" })
    mockVerify.mockResolvedValue({ email: user.email, sub: "different-sub" })
    const res = await request(app).post("/auth/google").send({ idToken: "valid" })
    expect(res.status).toBe(403)
  })
})

describe("GET /auth/me", () => {
  it("returns the current user with a valid session", async () => {
    const user = await makeUser("me")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app).get("/auth/me").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.user.id).toBe(user.id)
  })

  it("answers on an org-less session, with org: null and no membership required", async () => {
    const user = await makeUser("me-orgless")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app).get("/auth/me").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.org).toBeNull()
    expect(res.body.memberships).toEqual([])
  })

  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/auth/me")).status).toBe(401)
  })

  it("returns 401 with a garbage token", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "session=garbage")
    expect(res.status).toBe(401)
  })

  it("returns 401 with an expired session", async () => {
    const user = await makeUser("expired")
    const cookie = await makeSessionCookie(user.id, { expiresAt: new Date(Date.now() - 1000) })

    const res = await request(app).get("/auth/me").set("Cookie", cookie)
    expect(res.status).toBe(401)
  })

  it("returns 403 for a deactivated user with a live session", async () => {
    const user = await makeUser("disabled", { isActive: false })
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app).get("/auth/me").set("Cookie", cookie)
    expect(res.status).toBe(403)
  })
})

describe("POST /auth/logout", () => {
  it("invalidates the session", async () => {
    const user = await makeUser("logout")
    const cookie = await makeSessionCookie(user.id)

    const logout = await request(app).post("/auth/logout").set("Cookie", cookie)
    expect(logout.status).toBe(200)

    const me = await request(app).get("/auth/me").set("Cookie", cookie)
    expect(me.status).toBe(401)
  })
})

describe("requireAuth", () => {
  it("returns 403 with code ORG_REQUIRED for an org-less session", async () => {
    const user = await makeUser("org-required")
    const cookie = await makeSessionCookie(user.id)

    // GET /clients stands in for "any non-/auth/* route" - the acceptance
    // criterion is that none of them are reachable without an active org.
    const res = await request(app).get("/clients").set("Cookie", cookie)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe("ORG_REQUIRED")
  })

  it("returns 403 with code ORG_REQUIRED once the bound membership is deactivated", async () => {
    const user = await makeUser("revoked")
    const org = await ctx.org()
    const membership = await createMembership({ userId: user.id, orgId: org.id, role: "staff" })
    const cookie = await makeSessionCookie(user.id, { orgId: org.id })

    expect((await request(app).get("/clients").set("Cookie", cookie)).status).toBe(200)

    await db
      .update(orgMemberships)
      .set({ isActive: false })
      .where(eq(orgMemberships.id, membership.id))

    const res = await request(app).get("/clients").set("Cookie", cookie)
    expect(res.status).toBe(403)
    expect(res.body.code).toBe("ORG_REQUIRED")
  })
})

describe("requireRole", () => {
  const adminOnlyApp = express()
  adminOnlyApp.use(cookieParser())
  adminOnlyApp.get("/admin", requireAuth, requireRole("admin"), (_req, res) => {
    res.json({ ok: true })
  })

  it("rejects staff with 403", async () => {
    const user = await makeUser("staff")
    const org = await ctx.org()
    await createMembership({ userId: user.id, orgId: org.id, role: "staff" })
    const cookie = await makeSessionCookie(user.id, { orgId: org.id })

    const res = await request(adminOnlyApp).get("/admin").set("Cookie", cookie)
    expect(res.status).toBe(403)
  })

  it("allows admins", async () => {
    const user = await makeUser("admin")
    const org = await ctx.org()
    await createMembership({ userId: user.id, orgId: org.id, role: "admin" })
    const cookie = await makeSessionCookie(user.id, { orgId: org.id })

    const res = await request(adminOnlyApp).get("/admin").set("Cookie", cookie)
    expect(res.status).toBe(200)
  })

  it("fails a staff membership even when the same user is admin of another org", async () => {
    const user = await makeUser("cross-org")
    const staffOrg = await ctx.org()
    const adminOrg = await ctx.org()
    await createMembership({ userId: user.id, orgId: staffOrg.id, role: "staff" })
    await createMembership({ userId: user.id, orgId: adminOrg.id, role: "admin" })
    const cookie = await makeSessionCookie(user.id, { orgId: staffOrg.id })

    const res = await request(adminOnlyApp).get("/admin").set("Cookie", cookie)
    expect(res.status).toBe(403)
  })
})
