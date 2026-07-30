import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()

afterEach(() => {
  vi.unstubAllGlobals()
  return ctx.cleanup()
})

const VIN = "1HGCM82633A123456"

async function authed(prefix: string) {
  const user = await ctx.user(prefix)
  return makeSessionCookie(user.id)
}

// The route's only outbound dependency is fetch, so stub it rather than hitting
// vPIC in tests.
function stubVpic(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("GET /vin-decode", () => {
  it("returns 401 without a cookie", async () => {
    expect((await request(app).get(`/vin-decode?vin=${VIN}`)).status).toBe(401)
  })

  it("returns 400 when the VIN is not 17 characters", async () => {
    const cookie = await authed("vin-short")
    const res = await request(app).get("/vin-decode?vin=1HGCM826").set("Cookie", cookie)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("A VIN is 17 characters")
  })

  it("returns 400 when the VIN contains an excluded letter", async () => {
    const cookie = await authed("vin-letters")
    // 17 characters, but I/O/Q are never used in a VIN.
    const res = await request(app).get("/vin-decode?vin=1HGCM82633A12345I").set("Cookie", cookie)
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Invalid VIN")
  })

  it("returns 400 when vin is missing", async () => {
    const cookie = await authed("vin-missing")
    expect((await request(app).get("/vin-decode").set("Cookie", cookie)).status).toBe(400)
  })

  it("returns the normalized year, make, and model for a decoded VIN", async () => {
    const cookie = await authed("vin-hit")
    const fetchMock = stubVpic({
      Count: 1,
      Results: [{ ModelYear: "2003", Make: "HONDA", Model: "Accord" }],
    })

    const res = await request(app).get(`/vin-decode?vin=${VIN}`).set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ isValid: true, year: "2003", make: "HONDA", model: "Accord" })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain(VIN)
  })

  it("uppercases a lowercase VIN before querying upstream", async () => {
    const cookie = await authed("vin-case")
    const fetchMock = stubVpic({ Count: 1, Results: [{ Make: "HONDA" }] })

    const res = await request(app).get(`/vin-decode?vin=${VIN.toLowerCase()}`).set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(String(fetchMock.mock.calls[0][0])).toContain(VIN)
  })

  it("reports isValid false when upstream has no match", async () => {
    const cookie = await authed("vin-miss")
    stubVpic({ Count: 0, Results: [] })

    const res = await request(app).get(`/vin-decode?vin=${VIN}`).set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ isValid: false })
  })

  it("reports isValid false when upstream returns only blank fields", async () => {
    const cookie = await authed("vin-blank")
    stubVpic({ Count: 1, Results: [{ ModelYear: "", Make: "", Model: "" }] })

    const res = await request(app).get(`/vin-decode?vin=${VIN}`).set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ isValid: false })
  })

  it("omits fields upstream could not determine", async () => {
    const cookie = await authed("vin-partial")
    stubVpic({ Count: 1, Results: [{ ModelYear: "2003", Make: "HONDA", Model: "" }] })

    const res = await request(app).get(`/vin-decode?vin=${VIN}`).set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ isValid: true, year: "2003", make: "HONDA" })
  })

  it("returns 502 when upstream responds with an error status", async () => {
    const cookie = await authed("vin-5xx")
    stubVpic({}, { ok: false, status: 500 })

    const res = await request(app).get(`/vin-decode?vin=${VIN}`).set("Cookie", cookie)

    expect(res.status).toBe(502)
    expect(res.body.error).toBe("VIN lookup is unavailable")
  })

  it("returns 502 when the upstream request fails or times out", async () => {
    const cookie = await authed("vin-timeout")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("The operation was aborted due to timeout")
      })
    )

    const res = await request(app).get(`/vin-decode?vin=${VIN}`).set("Cookie", cookie)

    expect(res.status).toBe(502)
    expect(res.body.error).toBe("VIN lookup is unavailable")
  })
})
