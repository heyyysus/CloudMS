import request from "supertest"
import { describe, expect, it, vi } from "vitest"
import app from "../app"

describe("GET /config", () => {
  it("returns demoMode: false by default, unauthenticated", async () => {
    const res = await request(app).get("/config")
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ demoMode: false })
  })

  it("returns demoMode: true when DEMO_MODE is set", async () => {
    vi.stubEnv("DEMO_MODE", "true")
    const res = await request(app).get("/config")
    expect(res.body).toEqual({ demoMode: true })
    vi.unstubAllEnvs()
  })
})
