import { describe, expect, it } from "vitest"
import request from "supertest"
import app from "./app"

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(app).get("/health")

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: "ok", timestamp: expect.any(String) })
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp)
  })
})
