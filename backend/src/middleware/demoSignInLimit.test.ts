import express from "express"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { demoSignInLimit } from "./demoSignInLimit"

const ORIGINAL_LIMIT = process.env.DEMO_SIGNIN_LIMIT_PER_HOUR

function buildApp() {
  const app = express()
  app.post("/t", demoSignInLimit, (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe("demoSignInLimit", () => {
  beforeEach(() => {
    process.env.DEMO_SIGNIN_LIMIT_PER_HOUR = "2"
  })

  afterEach(() => {
    vi.useRealTimers()
    if (ORIGINAL_LIMIT === undefined) delete process.env.DEMO_SIGNIN_LIMIT_PER_HOUR
    else process.env.DEMO_SIGNIN_LIMIT_PER_HOUR = ORIGINAL_LIMIT
  })

  it("allows requests under the limit", async () => {
    const app = buildApp()
    const res1 = await request(app).post("/t").set("X-Forwarded-For", "1.1.1.1")
    const res2 = await request(app).post("/t").set("X-Forwarded-For", "1.1.1.1")
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
  })

  it("429s the (N+1)th request from the same IP with a JSON error", async () => {
    const app = buildApp()
    await request(app).post("/t").set("X-Forwarded-For", "2.2.2.2")
    await request(app).post("/t").set("X-Forwarded-For", "2.2.2.2")
    const res = await request(app).post("/t").set("X-Forwarded-For", "2.2.2.2")
    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: expect.any(String) })
  })

  it("does not affect a different IP", async () => {
    const app = buildApp()
    await request(app).post("/t").set("X-Forwarded-For", "3.3.3.3")
    await request(app).post("/t").set("X-Forwarded-For", "3.3.3.3")
    const blocked = await request(app).post("/t").set("X-Forwarded-For", "3.3.3.3")
    expect(blocked.status).toBe(429)

    const other = await request(app).post("/t").set("X-Forwarded-For", "4.4.4.4")
    expect(other.status).toBe(200)
  })

  it("takes only the left-most X-Forwarded-For entry", async () => {
    const app = buildApp()
    await request(app).post("/t").set("X-Forwarded-For", "5.5.5.5, 9.9.9.9")
    await request(app).post("/t").set("X-Forwarded-For", "5.5.5.5, 8.8.8.8")
    const res = await request(app).post("/t").set("X-Forwarded-For", "5.5.5.5, 7.7.7.7")
    expect(res.status).toBe(429)
  })

  it("rolls the window after it elapses", async () => {
    vi.useFakeTimers()
    const app = buildApp()
    const ip = "6.6.6.6"
    await request(app).post("/t").set("X-Forwarded-For", ip)
    await request(app).post("/t").set("X-Forwarded-For", ip)
    const blocked = await request(app).post("/t").set("X-Forwarded-For", ip)
    expect(blocked.status).toBe(429)

    vi.advanceTimersByTime(60 * 60 * 1000 + 1)

    const afterRoll = await request(app).post("/t").set("X-Forwarded-For", ip)
    expect(afterRoll.status).toBe(200)
  })
})
