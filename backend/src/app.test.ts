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

  it("is not cacheable", async () => {
    const res = await request(app).get("/health")

    expect(res.headers["cache-control"]).toBe("no-store")
    expect(res.headers["etag"]).toBeUndefined()
  })
})

describe("request body limit", () => {
  it("rejects an oversized JSON body with a 413 and the standard error shape", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send({ big: "x".repeat(300_000) })

    expect(res.status).toBe(413)
    expect(res.body).toEqual({ error: expect.any(String) })
  })

  it("does not reject a small JSON body on the same path", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send({ small: "x" })

    expect(res.status).not.toBe(413)
  })
})
