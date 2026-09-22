import express from "express"
import cookieParser from "cookie-parser"
import { like } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { db } from "../db"
import { users } from "../db/schema"
import { createMembership, createUser } from "../repositories"
import { TestContext } from "../routes/testHelpers"
import { requireAuth, requirePlatformOwner, requireRole, requireSession } from "./middleware"

const testEmailPrefix = "platform-owner-auth-test-"

const ctx = new TestContext()

function makeUser(suffix: string, isPlatformOwner = false) {
  return createUser({
    email: `${testEmailPrefix}${suffix}@example.com`,
    isPlatformOwner,
  })
}

afterEach(async () => {
  await db.delete(users).where(like(users.email, `${testEmailPrefix}%`))
  await ctx.cleanup()
})

const platformOnlyApp = express()
platformOnlyApp.use(cookieParser())
platformOnlyApp.get("/platform-only", requireSession, requirePlatformOwner, (_req, res) => {
  res.json({ ok: true })
})
// No requireSession in the chain: req.user is never set, so this must 401
// rather than pass through.
platformOnlyApp.get("/unmounted", requirePlatformOwner, (_req, res) => {
  res.json({ ok: true })
})
platformOnlyApp.get("/admin-only", requireAuth, requireRole("admin"), (_req, res) => {
  res.json({ ok: true })
})

describe("requirePlatformOwner", () => {
  it("lets a platform owner through with an unbound session and zero memberships", async () => {
    const user = await makeUser("unbound", true)
    const cookie = await ctx.unboundCookie(user.id)

    const res = await request(platformOnlyApp).get("/platform-only").set("Cookie", cookie)

    expect(res.status).toBe(200)
  })

  it("rejects a user holding an admin membership in every org, not just this one", async () => {
    const user = await makeUser("cross-org-admin", false)
    const orgA = await ctx.org()
    const orgB = await ctx.org()
    const orgC = await ctx.org()
    for (const org of [orgA, orgB, orgC]) {
      await createMembership({ userId: user.id, orgId: org.id, role: "admin" })
    }
    const cookie = await ctx.cookie(user.id, orgA.id)

    const res = await request(platformOnlyApp).get("/platform-only").set("Cookie", cookie)

    expect(res.status).toBe(403)
  })

  it("grants nothing inside an org: a platform owner with staff membership still fails requireRole(admin)", async () => {
    const user = await makeUser("staff-owner", true)
    const org = await ctx.org()
    await createMembership({ userId: user.id, orgId: org.id, role: "staff" })
    const cookie = await ctx.cookie(user.id, org.id)

    const res = await request(platformOnlyApp).get("/admin-only").set("Cookie", cookie)

    expect(res.status).toBe(403)
  })

  it("401s with no session cookie", async () => {
    const res = await request(platformOnlyApp).get("/platform-only")
    expect(res.status).toBe(401)
  })

  it("401s when mounted without requireSession, even for a real platform owner", async () => {
    const user = await makeUser("unmounted", true)
    const cookie = await ctx.unboundCookie(user.id)

    const res = await request(platformOnlyApp).get("/unmounted").set("Cookie", cookie)

    expect(res.status).toBe(401)
  })
})

describe("GET /auth/me", () => {
  it("reports isPlatformOwner: true for a platform owner", async () => {
    const user = await makeUser("me-owner", true)
    const cookie = await ctx.unboundCookie(user.id)

    const res = await request(app).get("/auth/me").set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body.user.isPlatformOwner).toBe(true)
  })

  it("reports isPlatformOwner: false for an ordinary user", async () => {
    const user = await makeUser("me-ordinary", false)
    const cookie = await ctx.unboundCookie(user.id)

    const res = await request(app).get("/auth/me").set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body.user.isPlatformOwner).toBe(false)
  })
})
