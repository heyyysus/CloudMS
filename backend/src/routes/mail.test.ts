import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { addEmailToClient } from "../repositories"
import { makeSessionCookie, TestContext } from "./testHelpers"

const ctx = new TestContext()

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
  return ctx.cleanup()
})

function configureMail() {
  process.env.RESEND_API_KEY = "re_test"
  process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
}

function stubResend(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = vi.fn(async (_url: string, _requestInit?: RequestInit) => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

describe("POST /clients/:clientId/send-email", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app)
      .post("/clients/1/send-email")
      .send({ subject: "Hi", body: "Hello" })
    expect(res.status).toBe(401)
  })

  it("returns 403 for a non-admin user", async () => {
    const user = await ctx.user("mail-staff", "staff")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello" })

    expect(res.status).toBe(403)
  })

  it("returns 400 for an invalid clientId", async () => {
    const user = await ctx.user("mail-badid", "admin")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .post("/clients/abc/send-email")
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello" })

    expect(res.status).toBe(400)
  })

  it("returns 400 for an empty subject or body", async () => {
    const user = await ctx.user("mail-empty", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "", body: "" })

    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown client", async () => {
    const user = await ctx.user("mail-404", "admin")
    const cookie = await makeSessionCookie(user.id)

    const res = await request(app)
      .post("/clients/999999999/send-email")
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello" })

    expect(res.status).toBe(404)
  })

  it("returns 422 when the client has no email on file", async () => {
    const user = await ctx.user("mail-noemail", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello" })

    expect(res.status).toBe(422)
  })

  it("returns 400 when `to` includes an address not on file for the client", async () => {
    const user = await ctx.user("mail-unknownto", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    await addEmailToClient(client.id, "onfile@example.com")

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello", to: ["someone-else@example.com"] })

    expect(res.status).toBe(400)
  })

  it("sends to every on-file address when `to` is omitted", async () => {
    configureMail()
    const user = await ctx.user("mail-allon", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    await addEmailToClient(client.id, "first@example.com")
    await addEmailToClient(client.id, "second@example.com")
    const fetchMock = stubResend({ id: "msg_1" })

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "Renewal", body: "Your policy renews soon." })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe("msg_1")
    expect(res.body.to.sort()).toEqual(["first@example.com", "second@example.com"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(requestBody.to.sort()).toEqual(["first@example.com", "second@example.com"])
    expect(requestBody.subject).toBe("Renewal")
    expect(requestBody.text).toBe("Your policy renews soon.")
  })

  it("sends only to the requested `to` addresses, case-insensitively matched", async () => {
    configureMail()
    const user = await ctx.user("mail-subset", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    await addEmailToClient(client.id, "First@Example.com")
    await addEmailToClient(client.id, "second@example.com")
    stubResend({ id: "msg_2" })

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello", to: ["first@example.com"] })

    expect(res.status).toBe(201)
    expect(res.body.to).toEqual(["first@example.com"])
  })

  it("returns 503 when mail isn't configured", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    const user = await ctx.user("mail-unconfigured", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    await addEmailToClient(client.id, "onfile@example.com")

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello" })

    expect(res.status).toBe(503)
  })

  it("returns 502 when Resend responds with an error status", async () => {
    configureMail()
    const user = await ctx.user("mail-5xx", "admin")
    const cookie = await makeSessionCookie(user.id)
    const client = await ctx.client()
    await addEmailToClient(client.id, "onfile@example.com")
    stubResend(
      { name: "rate_limit_exceeded", message: "Too many requests." },
      { ok: false, status: 429 }
    )

    const res = await request(app)
      .post(`/clients/${client.id}/send-email`)
      .set("Cookie", cookie)
      .send({ subject: "Hi", body: "Hello" })

    expect(res.status).toBe(502)
  })
})
