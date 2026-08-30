import { inArray } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { sessions, users } from "../db/schema"

const createdUserIds: number[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.resetModules()
  if (createdUserIds.length) {
    await db.delete(sessions).where(inArray(sessions.userId, createdUserIds))
    await db.delete(users).where(inArray(users.id, createdUserIds))
    createdUserIds.length = 0
  }
})

describe("POST /auth/demo (demo mode off)", () => {
  it("is absent - 404", async () => {
    const res = await request(app).post("/auth/demo").send({ name: "Visitor" })
    expect(res.status).toBe(404)
  })
})

describe("POST /auth/demo (demo mode on)", () => {
  async function demoApp() {
    vi.stubEnv("DEMO_MODE", "true")
    vi.resetModules()
    const { default: demoApp } = await import("../app")
    return demoApp
  }

  it("creates a demo admin user and sets a session cookie", async () => {
    const app = await demoApp()

    const res = await request(app).post("/auth/demo").send({ name: "Visitor" })

    expect(res.status).toBe(200)
    expect(res.body.user).toMatchObject({ name: "Visitor", role: "admin" })
    expect(res.body.user.email).toMatch(/^demo-[0-9a-f]{16}@example\.com$/)
    createdUserIds.push(res.body.user.id)

    const cookie = res.headers["set-cookie"]?.[0]
    expect(cookie).toContain("session=")
    expect(cookie).toContain("HttpOnly")

    const me = await request(app).get("/auth/me").set("Cookie", cookie)
    expect(me.status).toBe(200)
    expect(me.body.user.id).toBe(res.body.user.id)

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.userId, [res.body.user.id]))
    const expectedExpiry = Date.now() + 240 * 60 * 1000
    expect(Math.abs(sessionRow.expiresAt.getTime() - expectedExpiry)).toBeLessThan(60_000)
  })

  it("honors DEMO_SESSION_TTL_MINUTES", async () => {
    vi.stubEnv("DEMO_SESSION_TTL_MINUTES", "5")
    const app = await demoApp()

    const res = await request(app).post("/auth/demo").send({ name: "Visitor" })
    createdUserIds.push(res.body.user.id)

    const [sessionRow] = await db
      .select()
      .from(sessions)
      .where(inArray(sessions.userId, [res.body.user.id]))
    const expectedExpiry = Date.now() + 5 * 60 * 1000
    expect(Math.abs(sessionRow.expiresAt.getTime() - expectedExpiry)).toBeLessThan(60_000)
  })

  it("returns 400 for a blank name", async () => {
    const app = await demoApp()
    const res = await request(app).post("/auth/demo").send({ name: "   " })
    expect(res.status).toBe(400)
  })

  it("returns 400 for a missing name", async () => {
    const app = await demoApp()
    const res = await request(app).post("/auth/demo").send({})
    expect(res.status).toBe(400)
  })
})
