import request from "supertest"
import { describe, expect, it, vi } from "vitest"
import app from "../app"

describe("GET /config", () => {
  it("returns demoMode: false by default, unauthenticated", async () => {
    const res = await request(app).get("/config")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ demoMode: false })
  })

  it("returns demoMode: true and the default demoResetMinutes when DEMO_MODE is set", async () => {
    vi.stubEnv("DEMO_MODE", "true")
    const res = await request(app).get("/config")
    expect(res.body).toEqual({ demoMode: true, demoResetMinutes: 15 })
    vi.unstubAllEnvs()
  })

  // The reported number is the reseed job's own interval, not a second env
  // var - a visitor can't be shown a cadence the job isn't running at.
  it("tracks the reseed job's configured interval", async () => {
    vi.stubEnv("DEMO_MODE", "true")
    vi.stubEnv("DEMO_RESEED_INTERVAL_MINUTES", "30")
    const res = await request(app).get("/config")
    expect(res.body).toEqual({ demoMode: true, demoResetMinutes: 30 })
    vi.unstubAllEnvs()
  })

  it("falls back to the default interval rather than reporting zero", async () => {
    vi.stubEnv("DEMO_MODE", "true")
    vi.stubEnv("DEMO_RESEED_INTERVAL_MINUTES", "0")
    const res = await request(app).get("/config")
    expect(res.body).toEqual({ demoMode: true, demoResetMinutes: 15 })
    vi.unstubAllEnvs()
  })
})
