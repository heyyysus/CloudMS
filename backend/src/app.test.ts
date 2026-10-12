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

describe("malformed request bodies", () => {
  it("answers 400 for JSON that does not parse", async () => {
    const res = await request(app)
      .post("/carriers")
      .set("Content-Type", "application/json")
      .send('{"name": ')

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: "Malformed JSON body" })
  })

  it("answers 415 for a charset the body parser cannot read", async () => {
    const res = await request(app)
      .post("/carriers")
      .set("Content-Type", "application/json; charset=x-unknown")
      .send('{"name": "x"}')

    expect(res.status).toBe(415)
    expect(res.body).toEqual({ error: "Invalid request body" })
  })
})
