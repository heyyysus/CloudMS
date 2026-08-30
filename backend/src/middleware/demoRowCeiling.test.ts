import express from "express"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import { persons } from "../db/schema"
import { TestContext } from "../routes/testHelpers"
import { demoRowCeiling } from "./demoRowCeiling"

const ORIGINAL_DEMO_MODE = process.env.DEMO_MODE
const ORIGINAL_MAX_ROWS = process.env.DEMO_MAX_ROWS_PER_TABLE

function buildApp() {
  const app = express()
  app.use(express.json())
  app.post("/t", demoRowCeiling(persons), (_req, res) => {
    res.json({ ok: true })
  })
  return app
}

describe("demoRowCeiling", () => {
  const ctx = new TestContext()

  afterEach(async () => {
    await ctx.cleanup()
    if (ORIGINAL_DEMO_MODE === undefined) delete process.env.DEMO_MODE
    else process.env.DEMO_MODE = ORIGINAL_DEMO_MODE
    if (ORIGINAL_MAX_ROWS === undefined) delete process.env.DEMO_MAX_ROWS_PER_TABLE
    else process.env.DEMO_MAX_ROWS_PER_TABLE = ORIGINAL_MAX_ROWS
  })

  it("allows the request when under the ceiling", async () => {
    process.env.DEMO_MODE = "true"
    process.env.DEMO_MAX_ROWS_PER_TABLE = "1000000"

    const res = await request(buildApp()).post("/t").send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })

  it("returns 429 at the ceiling", async () => {
    await ctx.person()
    process.env.DEMO_MODE = "true"
    process.env.DEMO_MAX_ROWS_PER_TABLE = "1"

    const res = await request(buildApp()).post("/t").send({})

    expect(res.status).toBe(429)
    expect(res.body).toEqual({ error: "Demo row limit reached; data resets on the next reseed." })
  })

  it("allows the request when demo mode is off, even over the configured ceiling", async () => {
    delete process.env.DEMO_MODE
    process.env.DEMO_MAX_ROWS_PER_TABLE = "1"

    const res = await request(buildApp()).post("/t").send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
