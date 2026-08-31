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
    expect(res.body).toEqual({ demoMode: true, demoResetMinutes: 60 })
    vi.unstubAllEnvs()
  })

  it("reports a configured DEMO_RESET_MINUTES", async () => {
    vi.stubEnv("DEMO_MODE", "true")
    vi.stubEnv("DEMO_RESET_MINUTES", "30")
    const res = await request(app).get("/config")
    expect(res.body).toEqual({ demoMode: true, demoResetMinutes: 30 })
    vi.unstubAllEnvs()
  })

  it("omits demoResetMinutes when DEMO_RESET_MINUTES is 0", async () => {
    vi.stubEnv("DEMO_MODE", "true")
    vi.stubEnv("DEMO_RESET_MINUTES", "0")
    const res = await request(app).get("/config")
    expect(res.body).toEqual({ demoMode: true })
    vi.unstubAllEnvs()
  })
})
