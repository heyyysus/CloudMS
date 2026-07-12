import express from "express"
import cookieParser from "cookie-parser"
import { like } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { users } from "../db/schema"
import { createSession, createUser, findUserByEmail } from "../repositories"
import type { User } from "../types"
import { verifyGoogleIdToken } from "./google"
import { requireAuth, requireRole } from "./middleware"
import { generateSessionToken, hashToken } from "./tokens"

vi.mock("./google", () => ({
  verifyGoogleIdToken: vi.fn(),
}))

const mockVerify = vi.mocked(verifyGoogleIdToken)

const testEmailPrefix = "auth-test-"

function makeUser(suffix: string, overrides: Partial<User> = {}) {
  return createUser({ email: `${testEmailPrefix}${suffix}@example.com`, ...overrides })
}

async function makeSessionCookie(userId: number, expiresAt?: Date) {
  const token = generateSessionToken()
  await createSession({
    userId,
    tokenHash: hashToken(token),
    expiresAt: expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
  })
  return `session=${token}`
}

afterEach(async () => {
  vi.clearAllMocks()
  await db.delete(users).where(like(users.email, `${testEmailPrefix}%`))
})

describe("POST /auth/google", () => {
  it("logs in an invited user and sets a session cookie", async () => {
    const user = await makeUser("login")
    mockVerify.mockResolvedValue({ email: user.email, sub: "google-sub-1", name: "Test User" })

    const res = await request(app).post("/auth/google").send({ idToken: "valid" })

    expect(res.status).toBe(200)
    expect(res.body.user).toEqual({
      id: user.id,
      email: user.email,
      name: "Test User",
      role: "staff",
    })
    const cookie = res.headers["set-cookie"]?.[0]
    expect(cookie).toContain("session=")
    expect(cookie).toContain("HttpOnly")

    const updated = await findUserByEmail(user.email)
    expect(updated?.googleSub).toBe("google-sub-1")
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

  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/auth/me")).status).toBe(401)
  })

  it("returns 401 with a garbage token", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "session=garbage")
    expect(res.status).toBe(401)
  })

  it("returns 401 with an expired session", async () => {
    const user = await makeUser("expired")
    const cookie = await makeSessionCookie(user.id, new Date(Date.now() - 1000))

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

describe("requireRole", () => {
  const adminOnlyApp = express()
  adminOnlyApp.use(cookieParser())
  adminOnlyApp.get("/admin", requireAuth, requireRole("admin"), (_req, res) => {
    res.json({ ok: true })
  })

  it("rejects staff with 403", async () => {
    const user = await makeUser("staff", { role: "staff" })
    const cookie = await makeSessionCookie(user.id)

    const res = await request(adminOnlyApp).get("/admin").set("Cookie", cookie)
    expect(res.status).toBe(403)
  })

  it("allows admins", async () => {
    const user = await makeUser("admin", { role: "admin" })
    const cookie = await makeSessionCookie(user.id)

    const res = await request(adminOnlyApp).get("/admin").set("Cookie", cookie)
    expect(res.status).toBe(200)
  })
})
