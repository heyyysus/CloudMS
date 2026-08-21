import { randomUUID } from "crypto"
import { eq, inArray } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { emailLog, emailTemplates, policyAttachments } from "../db/schema"
import { CORRESPONDENCE_MERGE_FIELDS, WELCOME_TEMPLATE_KEY } from "../emails"
import {
  addEmailToClient,
  createCorrespondenceTemplate,
  createPolicyAttachment,
  findEmailTemplateByKey,
  listPolicyLogAttachmentsByPolicyId,
  listPolicyLogsByPolicyId,
} from "../repositories"
import { getObject } from "../storage/r2"
import { makeSessionCookie, TestContext } from "./testHelpers"

// Attachment sends read the file bytes back out of R2 to base64-encode them.
// Mocked so tests don't need real R2 credentials; everything else in the
// module (R2NotConfiguredError, presign, etc.) is kept.
vi.mock("../storage/r2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../storage/r2")>()
  return { ...actual, getObject: vi.fn().mockResolvedValue(Buffer.from("PDFBYTES")) }
})

const ctx = new TestContext()

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(getObject).mockReset().mockResolvedValue(Buffer.from("PDFBYTES"))
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

// A policy attachment row backed by a fake R2 key (getObject is mocked, so no
// real object needs to exist). Attachments cascade-delete with their policy,
// so TestContext teardown reaps them.
async function makeAttachment(
  policyId: number,
  createdBy: number,
  overrides: { fileName?: string; sizeBytes?: number; isVoided?: boolean } = {}
) {
  const attachment = await createPolicyAttachment({
    policyId,
    fileName: overrides.fileName ?? "declarations.pdf",
    storageKey: `policy-attachments/${policyId}/${randomUUID()}-file.pdf`,
    mimeType: "application/pdf",
    sizeBytes: overrides.sizeBytes ?? 1024,
    createdBy,
  })
  if (overrides.isVoided) {
    await db
      .update(policyAttachments)
      .set({ isVoided: true })
      .where(eq(policyAttachments.id, attachment.id))
  }
  return attachment
}

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

  it("appends exactly one policy log entry with the full sent email", async () => {
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
    // The log records the actual email: recipients, subject, and rendered body.
    const lines = logs[0].body.split("\n")
    expect(lines[0]).toBe("To: jane@example.com")
    expect(logs[0].body).toContain("Cc: spouse@example.com")
    // Subject renders the {{policyNumber}} merge field from the fixture template.
    expect(logs[0].body).toContain(`Subject: Policy ${policy.policyNumber} renews soon`)
    // And the rendered body text (merge fields expanded, no raw {{ }} left).
    expect(logs[0].body).toContain("policy renews soon.")
    expect(logs[0].body).not.toContain("{{")
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

  it("attaches the selected files, base64-encoded, and records them on the log", async () => {
    configureMail()
    const { cookie, user, policy } = await makeSendFixture("send-attach")
    const template = await makeTemplate()
    const first = await makeAttachment(policy.id, user.id, { fileName: "dec-page.pdf" })
    const second = await makeAttachment(policy.id, user.id, { fileName: "id-card.pdf" })
    const fetchMock = stubResend({ id: "msg_corr_attach" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({
        templateId: template.id,
        to: ["jane@example.com"],
        attachmentIds: [first.id, second.id],
      })

    expect(res.status).toBe(201)

    // The Resend request carries both files, with the bytes from R2 base64'd.
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(requestBody.attachments).toEqual([
      { filename: "dec-page.pdf", content: Buffer.from("PDFBYTES").toString("base64") },
      { filename: "id-card.pdf", content: Buffer.from("PDFBYTES").toString("base64") },
    ])
    expect(vi.mocked(getObject)).toHaveBeenCalledTimes(2)

    // The policy log lists the file names, and the files are linked to it.
    const logs = await listPolicyLogsByPolicyId(policy.id)
    expect(logs).toHaveLength(1)
    expect(logs[0].body).toContain("Attachments: dec-page.pdf, id-card.pdf")

    const links = await listPolicyLogAttachmentsByPolicyId(policy.id)
    expect(links.map((l) => l.attachment.id).sort()).toEqual([first.id, second.id].sort())
  })

  it("returns 400 when an attachment belongs to another policy", async () => {
    configureMail()
    const { cookie, user, policy } = await makeSendFixture("send-attach-crosspolicy")
    const template = await makeTemplate()
    const otherPolicy = await ctx.policy({ clientId: policy.clientId, carrierId: policy.carrierId })
    const foreign = await makeAttachment(otherPolicy.id, user.id)
    const fetchMock = stubResend({ id: "msg_never" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"], attachmentIds: [foreign.id] })

    expect(res.status).toBe(400)
    // Nothing was sent, and no log was written.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(await listPolicyLogsByPolicyId(policy.id)).toHaveLength(0)
  })

  it("returns 400 for a voided attachment", async () => {
    configureMail()
    const { cookie, user, policy } = await makeSendFixture("send-attach-voided")
    const template = await makeTemplate()
    const voided = await makeAttachment(policy.id, user.id, { isVoided: true })
    stubResend({ id: "msg_never" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"], attachmentIds: [voided.id] })

    expect(res.status).toBe(400)
  })

  it("returns 404 for an unknown attachment id", async () => {
    configureMail()
    const { cookie, policy } = await makeSendFixture("send-attach-404")
    const template = await makeTemplate()
    stubResend({ id: "msg_never" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"], attachmentIds: [999999999] })

    expect(res.status).toBe(404)
  })

  it("returns 400 when the attachments exceed the total size limit", async () => {
    configureMail()
    const { cookie, user, policy } = await makeSendFixture("send-attach-toolarge")
    const template = await makeTemplate()
    const huge = await makeAttachment(policy.id, user.id, { sizeBytes: 26 * 1024 * 1024 })
    stubResend({ id: "msg_never" })

    const res = await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"], attachmentIds: [huge.id] })

    expect(res.status).toBe(400)
  })

  it("omits attachments from the Resend request for a plain send", async () => {
    configureMail()
    const { cookie, policy } = await makeSendFixture("send-attach-none")
    const template = await makeTemplate()
    const fetchMock = stubResend({ id: "msg_plain" })

    await request(app)
      .post(`/policies/${policy.id}/send-correspondence`)
      .set("Cookie", cookie)
      .send({ templateId: template.id, to: ["jane@example.com"] })

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(requestBody).not.toHaveProperty("attachments")
    expect(vi.mocked(getObject)).not.toHaveBeenCalled()
  })
})
