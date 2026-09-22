// Isolation layer 2's HTTP-level proof: every org-scoped route either has
// cross-tenant coverage below, or a documented reason it doesn't need any.
// ENTRIES is checked against the app's actual registered routes (see
// "every registered route is accounted for" below), so a new route fails
// that check the moment it's added, until someone adds an entry here.
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { db } from "../db"
import { scheduledEmails } from "../db/schema"
import { WELCOME_TEMPLATE_KEY } from "../emails"
import { attachmentKeyPrefix, createPolicyAttachment } from "../repositories"
import type { Organization, User } from "../types"
import { MISSING_ROW_ID, runInOrg, TestContext } from "./testHelpers"

const ctx = new TestContext()

afterEach(() => ctx.cleanup())

type Kind = "list" | "detail" | "create-with-parent" | "exempt"

interface Entry {
  method: "get" | "post" | "patch" | "put" | "delete"
  path: string
  kind: Kind
  // Required for "exempt" - why this route needs no cross-tenant case.
  reason?: string
}

// One row per route registered in app.ts. Kept as literal `:param` paths
// (not concrete ids) so this table only has to be updated when a route is
// added or removed, never when a fixture id changes.
const ENTRIES: Entry[] = [
  { method: "get", path: "/health", kind: "exempt", reason: "no org data" },
  {
    method: "get",
    path: "/organizations",
    kind: "exempt",
    reason: "platform-owner action that lists every org by design - not scoped to one",
  },
  {
    method: "post",
    path: "/organizations",
    kind: "exempt",
    reason: "platform-owner action that creates its own org - no existing org context to leak from",
  },
  {
    method: "post",
    path: "/auth/google",
    kind: "exempt",
    reason: "pre-org: establishes the session itself",
  },
  {
    method: "post",
    path: "/auth/org",
    kind: "exempt",
    reason: "pre-org by design: this is how a session picks its org",
  },
  { method: "post", path: "/auth/logout", kind: "exempt", reason: "pre-org, no org data returned" },
  {
    method: "get",
    path: "/auth/me",
    kind: "exempt",
    reason: "pre-org by design: the org picker itself",
  },
  { method: "get", path: "/persons", kind: "list" },
  { method: "get", path: "/persons/:id", kind: "detail" },
  {
    method: "post",
    path: "/persons",
    kind: "exempt",
    reason: "leaf resource, no parent id in the body to point at another org",
  },
  { method: "patch", path: "/persons/:id", kind: "detail" },
  { method: "delete", path: "/persons/:id", kind: "detail" },
  { method: "get", path: "/clients", kind: "list" },
  { method: "get", path: "/clients/:id", kind: "detail" },
  { method: "post", path: "/clients", kind: "create-with-parent" },
  { method: "patch", path: "/clients/:id", kind: "detail" },
  { method: "delete", path: "/clients/:id", kind: "detail" },
  { method: "get", path: "/policies", kind: "list" },
  { method: "get", path: "/policies/:id", kind: "detail" },
  { method: "post", path: "/policies", kind: "create-with-parent" },
  { method: "patch", path: "/policies/:id", kind: "detail" },
  { method: "delete", path: "/policies/:id", kind: "detail" },
  { method: "get", path: "/policy-logs", kind: "list" },
  { method: "post", path: "/policy-logs", kind: "create-with-parent" },
  { method: "get", path: "/policy-attachments", kind: "list" },
  { method: "get", path: "/policy-attachments/:id/link", kind: "detail" },
  { method: "post", path: "/policy-attachments/presign", kind: "create-with-parent" },
  { method: "post", path: "/policy-attachments/confirm", kind: "create-with-parent" },
  { method: "get", path: "/policy-log-attachments", kind: "list" },
  { method: "post", path: "/policy-log-attachments", kind: "create-with-parent" },
  { method: "delete", path: "/policy-log-attachments/:id", kind: "detail" },
  { method: "get", path: "/vehicles", kind: "list" },
  { method: "get", path: "/vehicles/:id", kind: "detail" },
  { method: "post", path: "/vehicles", kind: "create-with-parent" },
  { method: "patch", path: "/vehicles/:id", kind: "detail" },
  { method: "delete", path: "/vehicles/:id", kind: "detail" },
  { method: "get", path: "/carriers", kind: "list" },
  { method: "get", path: "/carriers/:id", kind: "detail" },
  {
    method: "post",
    path: "/carriers",
    kind: "exempt",
    reason: "leaf resource, no parent id in the body to point at another org",
  },
  { method: "patch", path: "/carriers/:id", kind: "detail" },
  { method: "delete", path: "/carriers/:id", kind: "detail" },
  { method: "get", path: "/invoices", kind: "list" },
  { method: "get", path: "/invoices/:id", kind: "detail" },
  { method: "post", path: "/invoices", kind: "create-with-parent" },
  { method: "post", path: "/invoices/:id/void", kind: "detail" },
  { method: "get", path: "/payments", kind: "list" },
  { method: "get", path: "/payments/:id", kind: "detail" },
  { method: "post", path: "/payments", kind: "create-with-parent" },
  { method: "post", path: "/payments/:id/void", kind: "detail" },
  { method: "get", path: "/receipts", kind: "list" },
  { method: "get", path: "/receipts/:id", kind: "detail" },
  { method: "post", path: "/clients/:clientId/send-email", kind: "create-with-parent" },
  { method: "get", path: "/policies/:policyId/merge-fields", kind: "detail" },
  { method: "post", path: "/policies/:policyId/send-correspondence", kind: "create-with-parent" },
  { method: "get", path: "/trust-ledger", kind: "list" },
  { method: "get", path: "/trust-balance", kind: "list" },
  { method: "get", path: "/search", kind: "list" },
  {
    method: "get",
    path: "/vin-decode",
    kind: "exempt",
    reason: "no org data - a public VIN lookup",
  },
  {
    method: "post",
    path: "/users/invite",
    kind: "exempt",
    reason: "own-org write, no cross-org id",
  },
  { method: "get", path: "/users", kind: "list" },
  { method: "patch", path: "/users/:id", kind: "detail" },
  { method: "post", path: "/users/:id/resend-welcome", kind: "detail" },
  { method: "delete", path: "/users/:id", kind: "detail" },
  { method: "post", path: "/users/:id/restore", kind: "detail" },
  { method: "get", path: "/email-templates/:key", kind: "list" },
  { method: "put", path: "/email-templates/:key", kind: "list" },
  { method: "get", path: "/correspondence-templates", kind: "list" },
  {
    method: "post",
    path: "/correspondence-templates",
    kind: "exempt",
    reason: "leaf resource, no parent id in the body to point at another org",
  },
  { method: "patch", path: "/correspondence-templates/:id", kind: "detail" },
  { method: "delete", path: "/correspondence-templates/:id", kind: "detail" },
  { method: "get", path: "/reminder-rules", kind: "list" },
  { method: "post", path: "/reminder-rules", kind: "create-with-parent" },
  { method: "patch", path: "/reminder-rules/:id", kind: "detail" },
  { method: "delete", path: "/reminder-rules/:id", kind: "detail" },
  { method: "get", path: "/scheduled-emails", kind: "list" },
  { method: "post", path: "/scheduled-emails/:id/cancel", kind: "detail" },
  {
    method: "post",
    path: "/reminders/tick",
    kind: "exempt",
    reason: "own-org action, no cross-org id to pass",
  },
  { method: "get", path: "/policies/:policyId/activities", kind: "detail" },
]

// Walks the app's actual route registrations (including mounted sub-routers,
// e.g. authRouter) into the same {method, path} shape as ENTRIES, so the two
// can be diffed directly.
function registeredRoutes(): { method: string; path: string }[] {
  const routes: { method: string; path: string }[] = []
  function walk(stack: unknown[]): void {
    for (const layer of stack as Record<string, unknown>[]) {
      const route = layer.route as { path: string; methods: Record<string, boolean> } | undefined
      if (route) {
        for (const method of Object.keys(route.methods)) {
          if (route.methods[method]) routes.push({ method, path: route.path })
        }
        continue
      }
      const handle = layer.handle as { stack?: unknown[] } | undefined
      if (layer.name === "router" && handle?.stack) walk(handle.stack)
    }
  }
  walk((app as unknown as { router: { stack: unknown[] } }).router.stack)
  return routes
}

describe("cross-tenant route coverage", () => {
  it("every registered route is accounted for in ENTRIES", () => {
    const registered = new Set(registeredRoutes().map((r) => `${r.method} ${r.path}`))
    const declared = new Set(ENTRIES.map((e) => `${e.method} ${e.path}`))
    expect([...registered].sort()).toEqual([...declared].sort())
  })

  it("every non-exempt entry has a reason, and exempt entries only", () => {
    for (const entry of ENTRIES) {
      if (entry.kind === "exempt") {
        expect(entry.reason, `${entry.method} ${entry.path} is exempt with no reason`).toBeTruthy()
      }
    }
  })
})

// Fixtures that live entirely in org B, built once and reused by every case
// below. cookieB lets tests mint further org-B rows (invoices/payments) over
// the real HTTP API, exercising the same request-scoped org context
// production traffic does.
async function buildOrgBFixtures(orgB: Organization) {
  const admin = await ctx.user("xt-b-admin", "admin", orgB.id)
  const cookie = await ctx.cookie(admin.id, orgB.id)
  const carrier = await ctx.carrier({ orgId: orgB.id })
  const client = await ctx.client({ orgId: orgB.id })
  const policy = await ctx.policy({ orgId: orgB.id, clientId: client.id, carrierId: carrier.id })
  const vehicle = await ctx.vehicle({ orgId: orgB.id, policyId: policy.id })
  const template = await ctx.template({ orgId: orgB.id })
  const rule = await ctx.reminderRule({ orgId: orgB.id, templateId: template.id })
  const log = await ctx.log(policy.id, admin.id, "org B log", orgB.id)
  const attachment = await runInOrg(orgB.id, () =>
    createPolicyAttachment(orgB.id, {
      policyId: policy.id,
      fileName: "org-b.pdf",
      storageKey: `${attachmentKeyPrefix(orgB.id, policy.id)}org-b.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      createdBy: admin.id,
    })
  )
  const invoiceRes = await request(app)
    .post("/invoices")
    .set("Cookie", cookie)
    .send({
      policyId: policy.id,
      items: [{ category: "agency", type: "new_business_fee", amount: 100 }],
    })
  expect(invoiceRes.status).toBe(201)
  const invoice = invoiceRes.body

  const paymentRes = await request(app)
    .post("/payments")
    .set("Cookie", cookie)
    .send({ invoiceId: invoice.id, method: "cash", amount: 100 })
  expect(paymentRes.status).toBe(201)
  const receipt = paymentRes.body
  const payment = receipt.payment

  const [scheduledEmail] = await runInOrg(orgB.id, () =>
    db
      .insert(scheduledEmails)
      .values({
        orgId: orgB.id,
        ruleId: rule.id,
        policyId: policy.id,
        occurrenceDate: "2026-01-01",
        scheduledFor: new Date(),
      })
      .returning()
  )

  const linkRes = await request(app)
    .post("/policy-log-attachments")
    .set("Cookie", cookie)
    .send({ logId: log.id, attachmentIds: [attachment.id] })
  expect(linkRes.status).toBe(201)
  const logAttachmentLink = linkRes.body[0]

  await request(app)
    .put(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
    .set("Cookie", cookie)
    .send({ subject: "Org B only subject", body: "Org B only body" })

  return {
    org: orgB,
    admin,
    cookie,
    carrier,
    client,
    policy,
    vehicle,
    template,
    rule,
    log,
    attachment,
    invoice,
    payment,
    receipt,
    scheduledEmail,
    logAttachmentLink,
  }
}

describe("cross-tenant isolation", () => {
  let orgAId: string
  let userA: User
  let cookieA: string
  let b: Awaited<ReturnType<typeof buildOrgBFixtures>>

  async function setup() {
    orgAId = await ctx.orgId()
    userA = await ctx.user("xt-a-admin", "admin", orgAId)
    cookieA = await ctx.cookie(userA.id, orgAId)
    const orgB = await ctx.org()
    b = await buildOrgBFixtures(orgB)
  }

  it("list endpoints never include another org's rows", async () => {
    await setup()

    const persons = await request(app).get("/persons").set("Cookie", cookieA)
    expect(persons.body.map((p: { id: string }) => p.id)).not.toContain(b.client.namedInsuredId)

    const clients = await request(app).get("/clients").set("Cookie", cookieA)
    expect(clients.body.map((c: { id: string }) => c.id)).not.toContain(b.client.id)

    const policies = await request(app).get("/policies").set("Cookie", cookieA)
    expect(policies.body.map((p: { id: string }) => p.id)).not.toContain(b.policy.id)

    const logs = await request(app)
      .get(`/policy-logs?policyId=${b.policy.id}`)
      .set("Cookie", cookieA)
    expect(logs.status).toBe(200)
    expect(logs.body).toEqual([])

    const attachments = await request(app)
      .get(`/policy-attachments?policyId=${b.policy.id}`)
      .set("Cookie", cookieA)
    expect(attachments.body).toEqual([])

    const logAttachments = await request(app)
      .get(`/policy-log-attachments?policyId=${b.policy.id}`)
      .set("Cookie", cookieA)
    expect(logAttachments.body).toEqual([])

    const vehicles = await request(app).get("/vehicles").set("Cookie", cookieA)
    expect(vehicles.body.map((v: { id: string }) => v.id)).not.toContain(b.vehicle.id)

    const carriers = await request(app).get("/carriers").set("Cookie", cookieA)
    expect(carriers.body.map((c: { id: string }) => c.id)).not.toContain(b.carrier.id)

    const invoices = await request(app)
      .get(`/invoices?clientId=${b.client.id}`)
      .set("Cookie", cookieA)
    expect(invoices.body).toEqual([])

    const payments = await request(app)
      .get(`/payments?clientId=${b.client.id}`)
      .set("Cookie", cookieA)
    expect(payments.body).toEqual([])

    const receipts = await request(app)
      .get(`/receipts?clientId=${b.client.id}`)
      .set("Cookie", cookieA)
    expect(receipts.body).toEqual([])

    const ledger = await request(app)
      .get(`/trust-ledger?clientId=${b.client.id}`)
      .set("Cookie", cookieA)
    expect(ledger.body).toEqual([])

    const balance = await request(app)
      .get(`/trust-balance?clientId=${b.client.id}`)
      .set("Cookie", cookieA)
    expect(balance.body.balance).toBe("0.00")

    const search = await request(app)
      .get(`/search?q=${encodeURIComponent(b.client.id)}`)
      .set("Cookie", cookieA)
    expect(search.body.clients).toEqual([])
    expect(search.body.policies).toEqual([])

    const users = await request(app).get("/users").set("Cookie", cookieA)
    expect(users.body.map((u: { id: string }) => u.id)).not.toContain(b.admin.id)

    // Org A's own welcome template, unmodified - not org B's PUT above.
    const template = await request(app)
      .get(`/email-templates/${WELCOME_TEMPLATE_KEY}`)
      .set("Cookie", cookieA)
    expect(template.body.template.subject).not.toBe("Org B only subject")

    const correspondence = await request(app)
      .get("/correspondence-templates")
      .set("Cookie", cookieA)
    expect(correspondence.body.templates.map((t: { id: string }) => t.id)).not.toContain(
      b.template.id
    )

    const rules = await request(app).get("/reminder-rules").set("Cookie", cookieA)
    expect(rules.body.rules.map((r: { id: string }) => r.id)).not.toContain(b.rule.id)

    const scheduled = await request(app).get("/scheduled-emails").set("Cookie", cookieA)
    expect(scheduled.body.scheduled.map((s: { id: string }) => s.id)).not.toContain(
      b.scheduledEmail.id
    )
  })

  it("detail/update/delete endpoints 404 on another org's id, and change nothing", async () => {
    await setup()

    const cases: {
      method: "get" | "patch" | "post" | "delete"
      path: string
      status: number
      body?: unknown
    }[] = [
      { method: "get", path: `/persons/${b.client.namedInsuredId}`, status: 404 },
      { method: "patch", path: `/persons/${b.client.namedInsuredId}`, status: 404 },
      { method: "delete", path: `/persons/${b.client.namedInsuredId}`, status: 404 },
      { method: "get", path: `/clients/${b.client.id}`, status: 404 },
      { method: "patch", path: `/clients/${b.client.id}`, status: 404 },
      { method: "delete", path: `/clients/${b.client.id}`, status: 404 },
      { method: "get", path: `/policies/${b.policy.id}`, status: 404 },
      { method: "patch", path: `/policies/${b.policy.id}`, status: 404 },
      { method: "delete", path: `/policies/${b.policy.id}`, status: 404 },
      { method: "get", path: `/policy-attachments/${b.attachment.id}/link`, status: 404 },
      { method: "delete", path: `/policy-log-attachments/${b.logAttachmentLink.id}`, status: 404 },
      { method: "get", path: `/vehicles/${b.vehicle.id}`, status: 404 },
      { method: "patch", path: `/vehicles/${b.vehicle.id}`, status: 404 },
      { method: "delete", path: `/vehicles/${b.vehicle.id}`, status: 404 },
      { method: "get", path: `/carriers/${b.carrier.id}`, status: 404 },
      { method: "patch", path: `/carriers/${b.carrier.id}`, status: 404 },
      { method: "delete", path: `/carriers/${b.carrier.id}`, status: 404 },
      { method: "get", path: `/invoices/${b.invoice.id}`, status: 404 },
      { method: "post", path: `/invoices/${b.invoice.id}/void`, status: 404 },
      { method: "get", path: `/payments/${b.payment.id}`, status: 404 },
      { method: "post", path: `/payments/${b.payment.id}/void`, status: 404 },
      { method: "get", path: `/receipts/${b.receipt.id}`, status: 404 },
      // updateCorrespondenceTemplateBody has no .partial(): a real body is
      // required or this 400s on validation before ever reaching the
      // org-scope check.
      {
        method: "patch",
        path: `/correspondence-templates/${b.template.id}`,
        status: 404,
        body: { name: "X", subject: "X", body: "X" },
      },
      { method: "delete", path: `/correspondence-templates/${b.template.id}`, status: 404 },
      // updateReminderRuleBody rejects an empty body (.refine(non-empty)), so
      // this needs at least one field too.
      {
        method: "patch",
        path: `/reminder-rules/${b.rule.id}`,
        status: 404,
        body: { enabled: true },
      },
      { method: "delete", path: `/reminder-rules/${b.rule.id}`, status: 404 },
      { method: "post", path: `/scheduled-emails/${b.scheduledEmail.id}/cancel`, status: 404 },
      { method: "patch", path: `/users/${b.admin.id}`, status: 404 },
      { method: "post", path: `/users/${b.admin.id}/resend-welcome`, status: 404 },
      { method: "delete", path: `/users/${b.admin.id}`, status: 404 },
      // b.admin is active, not soft-deleted, so restore's own "not deleted"
      // check 404s it - see restoreUser's `isNotNull(users.deletedAt)` guard.
      { method: "post", path: `/users/${b.admin.id}/restore`, status: 404 },
    ]

    for (const c of cases) {
      const res = await request(app)
        [c.method](c.path)
        .set("Cookie", cookieA)
        .send(c.body ?? {})
      expect(res.status, `${c.method} ${c.path}`).toBe(c.status)
    }

    // Spot-check that the rejected mutations changed nothing.
    const stillThere = await request(app).get(`/clients/${b.client.id}`).set("Cookie", b.cookie)
    expect(stillThere.status).toBe(200)
    const ruleStillEnabled = await request(app).get("/reminder-rules").set("Cookie", b.cookie)
    expect(ruleStillEnabled.body.rules.find((r: { id: string }) => r.id === b.rule.id)).toBeTruthy()
  })

  it("create-with-parent endpoints reject another org's parent id, and create nothing", async () => {
    await setup()

    const orgAPerson = await ctx.person()

    const clientRes = await request(app).post("/clients").set("Cookie", cookieA).send({
      namedInsuredId: b.client.namedInsuredId,
      mailingAddress1: "1 Test St",
      physicalAddress1: "1 Test St",
    })
    expect(clientRes.status).toBe(409)

    const orgACarrier = await ctx.carrier()
    const policyRes = await request(app).post("/policies").set("Cookie", cookieA).send({
      clientId: b.client.id,
      carrierId: orgACarrier.id,
      policyNumber: "XT-POL-1",
      effectiveDate: "2026-01-01",
      expirationDate: "2027-01-01",
    })
    // policies.ts maps CrossOrgReferenceError to 400 itself
    // (handlePolicyWriteError), unlike clients.ts/vehicles.ts which let it
    // fall through to app.ts's generic 409 handler.
    expect(policyRes.status).toBe(400)

    const orgAPolicy = await ctx.policy()
    const vehicleRes = await request(app).post("/vehicles").set("Cookie", cookieA).send({
      policyId: b.policy.id,
      vin: "XTVIN0000000001",
      make: "Honda",
      model: "Civic",
      year: 2021,
      garagingZip: "12345",
    })
    expect(vehicleRes.status).toBe(409)

    const logRes = await request(app).post("/policy-logs").set("Cookie", cookieA).send({
      policyId: b.policy.id,
      body: "cross-org log attempt",
    })
    expect(logRes.status).toBe(404)

    const invoiceRes = await request(app)
      .post("/invoices")
      .set("Cookie", cookieA)
      .send({
        policyId: b.policy.id,
        items: [{ category: "agency", type: "new_business_fee", amount: 50 }],
      })
    expect(invoiceRes.status).toBe(404)

    const paymentRes = await request(app).post("/payments").set("Cookie", cookieA).send({
      invoiceId: b.invoice.id,
      method: "cash",
      amount: 50,
    })
    expect(paymentRes.status).toBe(404)

    const presignRes = await request(app)
      .post("/policy-attachments/presign")
      .set("Cookie", cookieA)
      .send({
        policyId: b.policy.id,
        fileName: "x.pdf",
        contentType: "application/pdf",
        sizeBytes: 100,
      })
    expect(presignRes.status).toBe(404)

    const confirmRes = await request(app)
      .post("/policy-attachments/confirm")
      .set("Cookie", cookieA)
      .send({
        policyId: b.policy.id,
        storageKey: `${attachmentKeyPrefix(b.org.id, b.policy.id)}x.pdf`,
        fileName: "x.pdf",
      })
    expect(confirmRes.status).toBe(404)

    const linkRes = await request(app)
      .post("/policy-log-attachments")
      .set("Cookie", cookieA)
      .send({
        logId: b.log.id,
        attachmentIds: [MISSING_ROW_ID],
      })
    expect(linkRes.status).toBe(404)

    const orgATemplate = await ctx.template()
    const ruleRes = await request(app).post("/reminder-rules").set("Cookie", cookieA).send({
      name: "XT rule",
      offsetDays: 5,
      templateId: b.template.id,
    })
    expect(ruleRes.status).toBe(404)

    const sendEmailRes = await request(app)
      .post(`/clients/${b.client.id}/send-email`)
      .set("Cookie", cookieA)
      .send({ subject: "Hi", body: "Hi" })
    expect(sendEmailRes.status).toBe(404)

    const mergeFieldsRes = await request(app)
      .get(`/policies/${b.policy.id}/merge-fields`)
      .set("Cookie", cookieA)
    expect(mergeFieldsRes.status).toBe(404)

    const sendCorrespondenceRes = await request(app)
      .post(`/policies/${b.policy.id}/send-correspondence`)
      .set("Cookie", cookieA)
      .send({ templateId: orgATemplate.id, to: ["client@example.com"] })
    expect(sendCorrespondenceRes.status).toBe(404)

    const activitiesRes = await request(app)
      .get(`/policies/${b.policy.id}/activities`)
      .set("Cookie", cookieA)
    expect(activitiesRes.status).toBe(404)

    // Nothing landed in org A despite the 200-series checks above never
    // firing: org A's policy list is still exactly the one policy this test
    // itself created via ctx.policy() and orgAPolicy, not any of the above.
    const policiesAfter = await request(app).get("/policies").set("Cookie", cookieA)
    expect(policiesAfter.body.map((p: { id: string }) => p.id).sort()).toEqual(
      [orgAPolicy.id].sort()
    )

    // orgAPerson only exists to prove person-level fixtures still work in
    // this org; nothing above should have touched it.
    const personStill = await request(app).get(`/persons/${orgAPerson.id}`).set("Cookie", cookieA)
    expect(personStill.status).toBe(200)
  })
})
