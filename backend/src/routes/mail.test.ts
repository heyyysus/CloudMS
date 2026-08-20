import { randomUUID } from "crypto"
import { eq, inArray } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { emailLog, emailTemplates } from "../db/schema"
import { CORRESPONDENCE_MERGE_FIELDS, WELCOME_TEMPLATE_KEY } from "../emails"
import {
  addEmailToClient,
  createCorrespondenceTemplate,
  findEmailTemplateByKey,
  listPolicyLogsByPolicyId,
} from "../repositories"
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

// A correspondence template referencing one merge field from each group, so
// the render assertions below prove client, policy, and agent values all
// resolve against real rows.
const TEMPLATE_BODY = {
  name: "Renewal Notice",
  subject: "Policy {{policyNumber}} renews soon",
  body: "Hi {{clientFullName}}, your {{carrierName}} policy renews soon.\n\n- {{agentName}}",
}

// Templates aren't tracked by TestContext (they're global, not client-scoped),
// so each test that creates one registers its id here for teardown.
const templateIds: number[] = []

afterEach(async () => {
  if (templateIds.length) {
    await db.delete(emailTemplates).where(inArray(emailTemplates.id, templateIds.splice(0)))
  }
})

// Creates a correspondence template directly, bypassing the admin-only POST
// route so these tests can run as staff.
async function makeTemplate(overrides: Partial<typeof TEMPLATE_BODY> = {}) {
  const body = { ...TEMPLATE_BODY, ...overrides }
  const template = await createCorrespondenceTemplate({
    key: `correspondence-test-${randomUUID().slice(0, 8)}`,
    ...body,
    updatedBy: null,
  })
  templateIds.push(template.id)
  return template
}

// A client with a named insured, an email, and a policy on a named carrier -
// enough for every merge field to resolve to something assertable.
async function makeSendFixture(prefix: string, role: "staff" | "admin" = "staff") {
  const user = await ctx.user(prefix, role)
  const cookie = await makeSessionCookie(user.id)
  const person = await ctx.person({ firstName: "Jane", lastName: "Doe" })
  const client = await ctx.client({ namedInsuredId: person.id })
  await addEmailToClient(client.id, "jane@example.com")
  const carrier = await ctx.carrier({ name: "Progressive" })
  const policy = await ctx.policy({ clientId: client.id, carrierId: carrier.id })
  return { user, cookie, client, carrier, policy }
}

describe("GET /policies/:policyId/merge-fields", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/policies/1/merge-fields")
    expect(res.status).toBe(401)
  })

  it("resolves every merge field against the real client and policy, for staff", async () => {
    const { cookie, user, policy } = await makeSendFixture("merge-staff")

    const res = await request(app).get(`/policies/${policy.id}/merge-fields`).set("Cookie", cookie)

    expect(res.status).toBe(200)
    // Every name in the catalog is present, so a template can never reference
    // a valid field that the preview leaves as a raw {{token}}.
    expect(Object.keys(res.body.values).sort()).toEqual([...CORRESPONDENCE_MERGE_FIELDS].sort())
    expect(res.body.values.clientFullName).toBe("Jane Doe")
    expect(res.body.values.clientEmail).toBe("jane@example.com")
    expect(res.body.values.policyNumber).toBe(policy.policyNumber)
    expect(res.body.values.carrierName).toBe("Progressive")
    expect(res.body.values.agentEmail).toBe(user.email)
  })

  it("returns 400 for an invalid policyId", async () => {
    const user = await ctx.user("merge-badid")
    const cookie = await makeSessionCookie(user.id)
    const res = await request(app).get("/policies/abc/merge-fields").set("Cookie", cookie)
    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown policy", async () => {
    const user = await ctx.user("merge-404")
    const cookie = await makeSessionCookie(user.id)
    const res = await request(app).get("/policies/999999999/merge-fields").set("Cookie", cookie)
    expect(res.status).toBe(404)
  })
})

describe("POST /policies/:policyId/send-correspondence", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app)
      .post("/policies/1/send-correspondence")
      .send({ templateId: 1, to: ["a@example.com"] })
    expect(res.status).toBe(401)
  })

  // The point of the feature: unlike the admin-only free-text send above,
  // staff may send an admin-authored template.
  it("lets staff send a template, merged with real client and policy data", async () => {
    configureMail()
    const { cookie, user, policy } = await makeSendFixture("send-staff")
    const template = await makeTemplate()
    const fetchMock = stubResend({ id: "msg_corr_1" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"], cc: ["spouse@example.com"] })

    expect(res.status).toBe(201)
    expect(res.body.id).toBe("msg_corr_1")
    expect(res.body.to).toEqual(["jane@example.com"])
    expect(res.body.cc).toEqual(["spouse@example.com"])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(requestBody.to).toEqual(["jane@example.com"])
    expect(requestBody.cc).toEqual(["spouse@example.com"])
    expect(requestBody.subject).toBe(`Policy ${policy.policyNumber} renews soon`)
    expect(requestBody.text).toBe(
      `Hi Jane Doe, your Progressive policy renews soon.\n\n- ${user.name ?? user.email}`
    )
  })

  it("omits cc entirely when none was given", async () => {
    configureMail()
    const { cookie, policy } = await makeSendFixture("send-nocc")
    const template = await makeTemplate()
    const fetchMock = stubResend({ id: "msg_corr_nocc" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"] })

    expect(res.status).toBe(201)
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(requestBody).not.toHaveProperty("cc")
  })

  // Free-text is deliberate here (contrast with /send-email above): staff can
  // copy a lienholder or a colleague who isn't on the client record.
  it("accepts an address that isn't on file for the client", async () => {
    configureMail()
    const { cookie, policy } = await makeSendFixture("send-offfile")
    const template = await makeTemplate()
    stubResend({ id: "msg_corr_off" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["lienholder@bank.example.com"] })

    expect(res.status).toBe(201)
  })

  it("writes one email_log row per to and cc address", async () => {
    configureMail()
    const { cookie, user, policy } = await makeSendFixture("send-log")
    const template = await makeTemplate()
    stubResend({ id: "msg_corr_2" })

    await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({
        templateId: template.id,
        to: ["jane@example.com"],
        cc: ["spouse@example.com", "agent@example.com"],
      })

    const rows = await db.select().from(emailLog).where(eq(emailLog.triggeredBy, user.id))
    expect(rows.map((r) => r.recipient).sort()).toEqual([
      "agent@example.com",
      "jane@example.com",
      "spouse@example.com",
    ])
    expect(rows.every((r) => r.status === "sent")).toBe(true)
    expect(rows.every((r) => r.templateKey === template.key)).toBe(true)
    expect(rows.every((r) => r.resendId === "msg_corr_2")).toBe(true)
  })

  it("appends exactly one policy log entry naming the template and recipients", async () => {
    configureMail()
    const { cookie, policy } = await makeSendFixture("send-policylog")
    const template = await makeTemplate()
    stubResend({ id: "msg_corr_3" })

    await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"], cc: ["spouse@example.com"] })

    const logs = await listPolicyLogsByPolicyId(policy.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].body).toBe(
      'Correspondence sent — "Renewal Notice" to jane@example.com; cc spouse@example.com.'
    )
  })

  it("returns 404 for an unknown policy", async () => {
    const { cookie } = await makeSendFixture("send-404policy")
    const template = await makeTemplate()

    const res = await request(app)
      .post("/policies/999999999/send-correspondence")
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"] })

    expect(res.status).toBe(404)
  })

  it("returns 404 for an unknown template", async () => {
    const { cookie, policy } = await makeSendFixture("send-404template")

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: 999999999, to: ["jane@example.com"] })

    expect(res.status).toBe(404)
  })

  // The welcome template is kind-scoped out of the correspondence lookup, so
  // the invite email can never be aimed at a client.
  it("returns 404 when templateId points at the welcome template", async () => {
    const { cookie, policy } = await makeSendFixture("send-welcome")
    const welcome = await findEmailTemplateByKey(WELCOME_TEMPLATE_KEY)
    expect(welcome).toBeDefined()

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: welcome!.id, to: ["jane@example.com"] })

    expect(res.status).toBe(404)
  })

  it("returns 400 for an empty `to`", async () => {
    const { cookie, policy } = await makeSendFixture("send-empty-to")
    const template = await makeTemplate()

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: [] })

    expect(res.status).toBe(400)
  })

  it("returns 400 for a malformed address", async () => {
    const { cookie, policy } = await makeSendFixture("send-badaddr")
    const template = await makeTemplate()

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["not-an-email"] })

    expect(res.status).toBe(400)
  })

  // Addresses are lowercased by the schema, so this catches the
  // case-different duplicate that would otherwise deliver twice.
  it("returns 400 when an address is in both to and cc", async () => {
    const { cookie, policy } = await makeSendFixture("send-overlap")
    const template = await makeTemplate()

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"], cc: ["Jane@Example.com"] })

    expect(res.status).toBe(400)
  })

  it("returns 503 and logs the failure when mail isn't configured", async () => {
    delete process.env.RESEND_API_KEY
    delete process.env.MAIL_FROM
    const { cookie, user, policy } = await makeSendFixture("send-unconfigured")
    const template = await makeTemplate()

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"] })

    expect(res.status).toBe(503)

    const rows = await db.select().from(emailLog).where(eq(emailLog.triggeredBy, user.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("failed")
    expect(rows[0].resendId).toBeNull()
    // Nothing was sent, so the policy's history must not claim otherwise.
    expect(await listPolicyLogsByPolicyId(policy.id)).toHaveLength(0)
  })

  it("returns 502 and logs the failure when Resend responds with an error status", async () => {
    configureMail()
    const { cookie, user, policy } = await makeSendFixture("send-502")
    const template = await makeTemplate()
    stubResend({ message: "boom" }, { ok: false, status: 500 })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"] })

    expect(res.status).toBe(502)

    const rows = await db.select().from(emailLog).where(eq(emailLog.triggeredBy, user.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("failed")
    expect(await listPolicyLogsByPolicyId(policy.id)).toHaveLength(0)
  })
})
