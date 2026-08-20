// The automated reminder subsystem end to end: the planner, the dispatcher,
// and the routes over both.
//
// Deliberately one file rather than three. planDueReminders and
// dispatchReminders operate over the *whole* table by design - that is what
// lets any container pick up any due reminder - so two test files exercising
// them in parallel vitest workers interfere through the database: one file's
// planner run queues another file's rule (stamping it with its own timezone
// env), and one file's dispatcher claims and sends another file's row. Vitest
// runs the tests within a file sequentially, so keeping them together is what
// makes them deterministic.
import { randomInt, randomUUID } from "crypto"
import { eq } from "drizzle-orm"
import { Client } from "pg"
import request from "supertest"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import app from "../app"
import { db } from "../db"
import { emailLog, reminderRules, scheduledEmails } from "../db/schema"
import { WELCOME_TEMPLATE_KEY } from "../emails"
import { findEmailTemplateByKey, listPolicyLogsByPolicyId } from "../repositories"
import { isoDaysFromToday, makeSessionCookie, TestContext } from "../routes/testHelpers"
import { AUTOMATION_USER_EMAIL, resetAutomationUserCache } from "./automationUser"
import { dispatchReminders } from "./dispatcher"
import { PLANNER_LOCK_KEY, planDueReminders, planReminders } from "./planner"

const ORIGINAL_ENV = { ...process.env }

let ctx: TestContext

beforeEach(() => {
  ctx = new TestContext()
  resetAutomationUserCache()
  process.env.RESEND_API_KEY = "re_test"
  process.env.MAIL_FROM = "Cloud CMS <noreply@example.com>"
  process.env.AGENCY_NAME = "Test Agency"
})

afterEach(async () => {
  await ctx.cleanup()
  vi.unstubAllGlobals()
  resetAutomationUserCache()
  process.env = { ...ORIGINAL_ENV }
})

async function rowsFor(policyId: number) {
  return db.select().from(scheduledEmails).where(eq(scheduledEmails.policyId, policyId))
}

// Builds an active policy whose expiration lines up with `offsetDays`, so the
// rule's target date is today and the planner should match it.
async function dueSetup(offsetDays: number, options: { withEmail?: boolean } = {}) {
  const client = await ctx.client()
  if (options.withEmail !== false) await ctx.clientEmail(client.id)
  const policy = await ctx.policy({
    clientId: client.id,
    status: "active",
    expirationDate: isoDaysFromToday(offsetDays),
  })
  const rule = await ctx.reminderRule({ offsetDays })
  return { client, policy, rule }
}

describe("planReminders", () => {
  it("queues a reminder for an active policy whose target date is today", async () => {
    const { policy, rule } = await dueSetup(112_345)

    const created = await planDueReminders()

    expect(created).toBeGreaterThanOrEqual(1)
    const rows = await rowsFor(policy.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].ruleId).toBe(rule.id)
    expect(rows[0].status).toBe("pending")
    expect(rows[0].occurrenceDate).toBe(policy.expirationDate)
  })

  // Only one container plans per tick. Correctness doesn't depend on this -
  // the unique constraint already makes a double plan a no-op - but it is what
  // stops N replicas doing identical work every minute. Held from a dedicated
  // connection rather than racing two planReminders() calls, which would only
  // contend if the event loop happened to overlap them.
  it("does not plan while another session holds the advisory lock", async () => {
    const holder = new Client({ connectionString: process.env.DATABASE_URL })
    await holder.connect()
    try {
      await holder.query("begin")
      const held = await holder.query("select pg_try_advisory_xact_lock($1) as locked", [
        PLANNER_LOCK_KEY,
      ])
      expect(held.rows[0].locked).toBe(true)

      expect(await planReminders()).toEqual({ planned: false, created: 0 })
    } finally {
      await holder.query("rollback")
      await holder.end()
    }
  })

  // The guarantee the whole design rests on: planning is idempotent, so a
  // double tick, a lost advisory lock, or a restart mid-plan cannot produce a
  // second email for the same occurrence.
  it("is idempotent - planning twice creates exactly one row", async () => {
    const { policy } = await dueSetup(112_346)

    await planDueReminders()
    await planDueReminders()

    expect(await rowsFor(policy.id)).toHaveLength(1)
  })

  it("re-queues after a renewal moves the expiration date", async () => {
    const { policy } = await dueSetup(112_347)
    await planDueReminders()

    // Renewing shifts expiration by a year; the same rule's target date lands
    // on today again only if we also move it back, so simulate the next term
    // by setting expiration such that the offset points at today again.
    const { updateAutoPolicy } = await import("../repositories")
    await updateAutoPolicy(policy.id, { expirationDate: isoDaysFromToday(112_347 + 365) })
    await planDueReminders()

    // Still one row: the new occurrence is 365 days out, outside the horizon.
    expect(await rowsFor(policy.id)).toHaveLength(1)
  })

  it("skips a disabled rule", async () => {
    const client = await ctx.client()
    await ctx.clientEmail(client.id)
    const policy = await ctx.policy({
      clientId: client.id,
      status: "active",
      expirationDate: isoDaysFromToday(112_348),
    })
    await ctx.reminderRule({ offsetDays: 112_348, enabled: false })

    await planDueReminders()

    expect(await rowsFor(policy.id)).toHaveLength(0)
  })

  it("skips a policy that is not active", async () => {
    const client = await ctx.client()
    await ctx.clientEmail(client.id)
    const policy = await ctx.policy({
      clientId: client.id,
      status: "cancelled",
      expirationDate: isoDaysFromToday(112_349),
    })
    await ctx.reminderRule({ offsetDays: 112_349 })

    await planDueReminders()

    expect(await rowsFor(policy.id)).toHaveLength(0)
  })

  // Queueing a send with nowhere to send it would just fail at dispatch. The
  // planner skips it instead and picks the policy up on a later tick once an
  // address is added.
  it("skips a client with no email address on file", async () => {
    const { policy } = await dueSetup(112_350, { withEmail: false })

    await planDueReminders()

    expect(await rowsFor(policy.id)).toHaveLength(0)
  })

  it("skips a policy whose target date is beyond the horizon", async () => {
    process.env.REMINDER_HORIZON_DAYS = "7"
    const client = await ctx.client()
    await ctx.clientEmail(client.id)
    // Target date is 30 days out, well past the 7-day horizon.
    const policy = await ctx.policy({
      clientId: client.id,
      status: "active",
      expirationDate: isoDaysFromToday(112_351 + 30),
    })
    await ctx.reminderRule({ offsetDays: 112_351 })

    await planDueReminders()

    expect(await rowsFor(policy.id)).toHaveLength(0)
  })

  it("skips a target date older than the lookback window", async () => {
    process.env.REMINDER_LOOKBACK_DAYS = "1"
    const client = await ctx.client()
    await ctx.clientEmail(client.id)
    // Target date was 10 days ago - too stale to send now.
    const policy = await ctx.policy({
      clientId: client.id,
      status: "active",
      expirationDate: isoDaysFromToday(112_352 - 10),
    })
    await ctx.reminderRule({ offsetDays: 112_352 })

    await planDueReminders()

    expect(await rowsFor(policy.id)).toHaveLength(0)
  })

  it("schedules the send at the configured local hour", async () => {
    process.env.REMINDER_TIMEZONE = "UTC"
    process.env.REMINDER_SEND_HOUR = "9"
    const { policy } = await dueSetup(112_353)

    await planDueReminders()

    const [row] = await rowsFor(policy.id)
    expect(row.scheduledFor.getUTCHours()).toBe(9)
  })

  // The headline claim of letting Postgres do the conversion: 9am agency time
  // is a different UTC instant either side of a DST boundary. Two policies,
  // one targeting a summer date and one a winter date, must land on 14:00 and
  // 15:00 UTC respectively.
  it("tracks DST when converting the local send hour to UTC", async () => {
    process.env.REMINDER_TIMEZONE = "America/Chicago"
    process.env.REMINDER_SEND_HOUR = "9"
    // A wide horizon so both target dates fall inside it regardless of when
    // this test runs.
    process.env.REMINDER_HORIZON_DAYS = "400"

    const client = await ctx.client()
    await ctx.clientEmail(client.id)
    const rule = await ctx.reminderRule({ offsetDays: 112_354 })

    // Relative to today rather than fixed years, so the test doesn't expire.
    const summerTarget = nextOccurrence(7, 1)
    const winterTarget = nextOccurrence(1, 15)
    const summer = await ctx.policy({
      clientId: client.id,
      status: "active",
      expirationDate: addDays(summerTarget, 112_354),
    })
    const winter = await ctx.policy({
      clientId: client.id,
      status: "active",
      expirationDate: addDays(winterTarget, 112_354),
    })

    await planDueReminders()

    const [summerRow] = await rowsFor(summer.id)
    const [winterRow] = await rowsFor(winter.id)
    expect(summerRow.ruleId).toBe(rule.id)
    // 9am CDT (UTC-5) is 14:00Z; 9am CST (UTC-6) is 15:00Z.
    expect(summerRow.scheduledFor.toISOString()).toBe(`${summerTarget}T14:00:00.000Z`)
    expect(winterRow.scheduledFor.toISOString()).toBe(`${winterTarget}T15:00:00.000Z`)
  })
})

// Shifts an ISO date by `days`, used to build an expiration whose target date
// (expiration - offset) is a specific calendar day.
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// The next month/day strictly after today, so both dates in the DST test are
// always in the future and always within the horizon the test sets.
function nextOccurrence(month: number, day: number): string {
  const today = new Date()
  const year = today.getUTCFullYear()
  const thisYear = Date.UTC(year, month - 1, day)
  const target = thisYear > today.getTime() ? thisYear : Date.UTC(year + 1, month - 1, day)
  return new Date(target).toISOString().slice(0, 10)
}

// email_log is never cleaned up between runs (it has no cascade to the
// fixtures), so ids are unique per stub or an assertion could match a row a
// previous run left behind.
function stubResend(init: { ok?: boolean; status?: number } = {}) {
  const id = `msg_${randomUUID().slice(0, 12)}`
  const fetchMock = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => (init.ok === false ? { message: "boom" } : { id }),
  }))
  vi.stubGlobal("fetch", fetchMock)
  return Object.assign(fetchMock, { resendId: id })
}

// Plans a reminder that is due right now, by dating the policy so the rule's
// target lands on today and then backdating scheduled_for past the send hour.
async function dueReminder(
  offsetDays: number,
  templateOverrides: { subject?: string; body?: string } = {}
) {
  const client = await ctx.client()
  const email = await ctx.clientEmail(client.id)
  const policy = await ctx.policy({
    clientId: client.id,
    status: "active",
    expirationDate: isoDaysFromToday(offsetDays),
  })
  const template = await ctx.template(templateOverrides)
  const rule = await ctx.reminderRule({ offsetDays, templateId: template.id })

  await planDueReminders()

  // The planner schedules for the configured hour, which may still be ahead of
  // now; pull it into the past so the dispatcher considers it due.
  await db
    .update(scheduledEmails)
    .set({ scheduledFor: new Date(Date.now() - 60_000) })
    .where(eq(scheduledEmails.policyId, policy.id))

  const [row] = await db
    .select()
    .from(scheduledEmails)
    .where(eq(scheduledEmails.policyId, policy.id))
  return { client, email, policy, template, rule, row }
}

// dispatchReminders claims whatever is due across the whole table, so a pass
// triggered here can also pick up rows another parallel test file created.
// These read the stub by recipient so assertions are about *this* test's mail.
function sentAddresses(fetchMock: { mock: { calls: unknown[][] } }): string[] {
  return fetchMock.mock.calls.flatMap((call) => {
    const init = call[1] as RequestInit
    return JSON.parse(init.body as string).to as string[]
  })
}

function sendTo(
  fetchMock: { mock: { calls: unknown[][] } },
  address: string
): [string, RequestInit] {
  const call = fetchMock.mock.calls.find((c) => {
    const init = c[1] as RequestInit
    return (JSON.parse(init.body as string).to as string[]).includes(address)
  })
  if (!call) throw new Error(`No send to ${address}`)
  return call as [string, RequestInit]
}

async function rowFor(policyId: number) {
  const [row] = await db
    .select()
    .from(scheduledEmails)
    .where(eq(scheduledEmails.policyId, policyId))
  return row
}

describe("dispatchReminders", () => {
  it("sends a due reminder and records it everywhere", async () => {
    const fetchMock = stubResend()
    const { policy, email, template } = await dueReminder(212_001)

    await dispatchReminders()

    const [, requestInit] = sendTo(fetchMock, email.email)
    const body = JSON.parse(requestInit.body as string)
    expect(body.to).toEqual([email.email])
    expect(body.subject).toBe(`Your policy ${policy.policyNumber}`)

    const row = await rowFor(policy.id)
    expect(row.status).toBe("sent")
    expect(row.resendId).toBe(fetchMock.resendId)
    expect(row.sentAt).not.toBeNull()

    // One email_log row per recipient, attributed to the automation user.
    const logged = await db.select().from(emailLog).where(eq(emailLog.resendId, fetchMock.resendId))
    expect(logged).toHaveLength(1)
    expect(logged[0].templateKey).toBe(template.key)
    expect(logged[0].status).toBe("sent")

    // And the send shows up in the policy's own history.
    const policyLogs = await listPolicyLogsByPolicyId(policy.id)
    expect(policyLogs).toHaveLength(1)
    expect(policyLogs[0].body).toContain(template.name!)
    expect(policyLogs[0].author.email).toBe(AUTOMATION_USER_EMAIL)
  })

  it("renders the agency name into {{agentName}}, since there is no agent", async () => {
    const fetchMock = stubResend()
    await dueReminder(212_002, { subject: "From {{agentName}}", body: "Regards, {{agentName}}" })

    await dispatchReminders()

    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(requestInit.body as string)
    expect(body.subject).toBe("From Test Agency")
    expect(body.text).toBe("Regards, Test Agency")
  })

  it("returns the row to pending and records the error when Resend fails", async () => {
    stubResend({ ok: false, status: 500 })
    const { policy } = await dueReminder(212_003)

    await dispatchReminders()

    const row = await rowFor(policy.id)
    expect(row.status).toBe("pending")
    expect(row.attempts).toBe(1)
    expect(row.lastError).toContain("Email send failed")
  })

  it("gives up after REMINDER_MAX_ATTEMPTS", async () => {
    process.env.REMINDER_MAX_ATTEMPTS = "2"
    stubResend({ ok: false, status: 500 })
    const { policy } = await dueReminder(212_004)

    await dispatchReminders()
    expect((await rowFor(policy.id)).status).toBe("pending")

    await dispatchReminders()

    const row = await rowFor(policy.id)
    expect(row.status).toBe("failed")
    expect(row.attempts).toBe(2)
  })

  // A missing API key is an install problem, not a delivery failure. Burning
  // retries on it would quietly retire every reminder before anyone noticed.
  it("holds the reminder without consuming an attempt when mail is unconfigured", async () => {
    const { policy } = await dueReminder(212_005)
    delete process.env.RESEND_API_KEY

    await dispatchReminders()

    const row = await rowFor(policy.id)
    expect(row.status).toBe("pending")
    expect(row.attempts).toBe(0)
    expect(row.lastError).toBe("Email sending is not configured")
  })

  // An UnsendableError - nothing a retry can fix - retires the row on the
  // first attempt instead of failing the same way three times.
  it("fails permanently, without retrying, when the client has no address left", async () => {
    const fetchMock = stubResend()
    const { client, policy } = await dueReminder(212_006)
    const { replaceClientEmails } = await import("../repositories")
    await replaceClientEmails(client.id, [])

    await dispatchReminders()

    expect(sentAddresses(fetchMock)).not.toContain(client.id)
    const row = await rowFor(policy.id)
    expect(row.status).toBe("failed")
    expect(row.attempts).toBe(1)
    expect(row.lastError).toContain("no email address on file")
  })

  it("releases a claim left stranded by a dead container", async () => {
    stubResend()
    const { policy } = await dueReminder(212_007)
    await db
      .update(scheduledEmails)
      .set({ status: "sending", claimedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(scheduledEmails.policyId, policy.id))

    await dispatchReminders()

    expect((await rowFor(policy.id)).status).toBe("sent")
  })

  it("leaves a freshly claimed row alone", async () => {
    stubResend()
    const { policy } = await dueReminder(212_008)
    await db
      .update(scheduledEmails)
      .set({ status: "sending", claimedAt: new Date() })
      .where(eq(scheduledEmails.policyId, policy.id))

    await dispatchReminders()

    expect((await rowFor(policy.id)).status).toBe("sending")
  })

  // The claim that justifies the whole design: N containers can dispatch at
  // once because FOR UPDATE SKIP LOCKED hands each row to exactly one of them.
  it("sends exactly once when two dispatchers run concurrently", async () => {
    const fetchMock = stubResend()
    const { policy, email } = await dueReminder(212_009)

    await Promise.all([dispatchReminders(), dispatchReminders()])

    // Exactly one of the two dispatchers sent to this policy's client, even
    // though both ran against the same due row.
    expect(sentAddresses(fetchMock).filter((to) => to === email.email)).toHaveLength(1)
    expect((await rowFor(policy.id)).status).toBe("sent")
  })

  it("does not send a reminder that is not due yet", async () => {
    const fetchMock = stubResend()
    const { policy, email } = await dueReminder(212_010)
    await db
      .update(scheduledEmails)
      .set({ scheduledFor: new Date(Date.now() + 60 * 60_000) })
      .where(eq(scheduledEmails.policyId, policy.id))

    await dispatchReminders()

    expect(sentAddresses(fetchMock)).not.toContain(email.email)
    expect((await rowFor(policy.id)).status).toBe("pending")
  })

  it("does not send a cancelled reminder", async () => {
    const fetchMock = stubResend()
    const { policy, email } = await dueReminder(212_011)
    await db
      .update(scheduledEmails)
      .set({ status: "cancelled" })
      .where(eq(scheduledEmails.policyId, policy.id))

    await dispatchReminders()

    expect(sentAddresses(fetchMock)).not.toContain(email.email)
    expect((await rowFor(policy.id)).status).toBe("cancelled")
  })
})

async function cookieFor(prefix: string, role: "admin" | "staff" = "admin") {
  const user = await ctx.user(prefix, role)
  return makeSessionCookie(user.id)
}

// reminder_rules is unique on (trigger, offset_days) across the whole table
// and vitest runs files in parallel workers, so fixture rules take offsets
// from a range no other file uses.
function freeOffset(): number {
  return randomInt(300_000, 400_000)
}

// Rules created through the route can't hide behind a huge offset - the zod
// schema caps them at +/-730 - so these tests use fixed values in that band
// and clear the offset first, so a row left behind by a crashed run can't
// fail the next one.
async function routeOffset(offsetDays: number): Promise<number> {
  await db.delete(reminderRules).where(eq(reminderRules.offsetDays, offsetDays))
  return offsetDays
}

describe("reminder rules", () => {
  describe("GET /reminder-rules", () => {
    it("returns 401 without a cookie", async () => {
      expect((await request(app).get("/reminder-rules")).status).toBe(401)
    })

    // Staff read this so the policy Activities tab can name the rule behind a
    // scheduled reminder; only authoring is admin-only.
    it("allows staff to list rules", async () => {
      const cookie = await cookieFor("rr-staff", "staff")
      const res = await request(app).get("/reminder-rules").set("Cookie", cookie)
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.rules)).toBe(true)
    })

    it("includes the template each rule sends", async () => {
      const cookie = await cookieFor("rr-list")
      const template = await ctx.template({ name: "Renewal Notice" })
      const rule = await ctx.reminderRule({ templateId: template.id })

      const res = await request(app).get("/reminder-rules").set("Cookie", cookie)

      const found = res.body.rules.find((r: { id: number }) => r.id === rule.id)
      expect(found.template.name).toBe("Renewal Notice")
    })
  })

  describe("POST /reminder-rules", () => {
    it("rejects a staff user", async () => {
      const cookie = await cookieFor("rr-post-staff", "staff")
      const template = await ctx.template()
      const res = await request(app)
        .post("/reminder-rules")
        .set("Cookie", cookie)
        .send({ name: "Nope", offsetDays: await routeOffset(721), templateId: template.id })
      expect(res.status).toBe(403)
    })

    it("creates a rule, disabled by default", async () => {
      const cookie = await cookieFor("rr-create")
      const template = await ctx.template()
      const offsetDays = await routeOffset(722)

      const res = await request(app)
        .post("/reminder-rules")
        .set("Cookie", cookie)
        .send({ name: "30 days out", offsetDays, templateId: template.id })

      expect(res.status).toBe(201)
      expect(res.body.enabled).toBe(false)
      expect(res.body.trigger).toBe("policy_expiration")
      ctx.track("rule", res.body.id)
    })

    // The welcome invite is scoped to a staff user's own details and has no
    // client merge fields, so it must never be wireable as client-facing.
    it("refuses to point a rule at the welcome template", async () => {
      const cookie = await cookieFor("rr-welcome")
      const welcome = await findEmailTemplateByKey(WELCOME_TEMPLATE_KEY)

      const res = await request(app)
        .post("/reminder-rules")
        .set("Cookie", cookie)
        .send({ name: "Bad", offsetDays: await routeOffset(723), templateId: welcome!.id })

      expect(res.status).toBe(404)
    })

    // Two rules at the same offset would send a client two emails the same
    // morning.
    it("rejects a duplicate trigger/offset pair", async () => {
      const cookie = await cookieFor("rr-dupe")
      const template = await ctx.template()
      const offsetDays = await routeOffset(724)
      const first = await request(app)
        .post("/reminder-rules")
        .set("Cookie", cookie)
        .send({ name: "First", offsetDays, templateId: template.id })
      ctx.track("rule", first.body.id)

      const res = await request(app)
        .post("/reminder-rules")
        .set("Cookie", cookie)
        .send({ name: "Second", offsetDays, templateId: template.id })

      expect(res.status).toBe(409)
    })

    it("rejects an offset outside the sanity bounds", async () => {
      const cookie = await cookieFor("rr-bounds")
      const template = await ctx.template()
      const res = await request(app)
        .post("/reminder-rules")
        .set("Cookie", cookie)
        .send({ name: "Way out", offsetDays: 5000, templateId: template.id })
      expect(res.status).toBe(400)
    })
  })

  describe("PATCH /reminder-rules/:id", () => {
    it("toggles enabled on its own", async () => {
      const cookie = await cookieFor("rr-toggle")
      const rule = await ctx.reminderRule({ enabled: false })

      const res = await request(app)
        .patch(`/reminder-rules/${rule.id}`)
        .set("Cookie", cookie)
        .send({ enabled: true })

      expect(res.status).toBe(200)
      expect(res.body.enabled).toBe(true)
    })

    it("rejects an empty patch", async () => {
      const cookie = await cookieFor("rr-empty")
      const rule = await ctx.reminderRule()
      const res = await request(app)
        .patch(`/reminder-rules/${rule.id}`)
        .set("Cookie", cookie)
        .send({})
      expect(res.status).toBe(400)
    })

    it("404s for an unknown rule", async () => {
      const cookie = await cookieFor("rr-missing")
      const res = await request(app)
        .patch("/reminder-rules/99999999")
        .set("Cookie", cookie)
        .send({ enabled: true })
      expect(res.status).toBe(404)
    })
  })

  describe("DELETE /reminder-rules/:id", () => {
    it("deletes a rule and its queued reminders", async () => {
      const cookie = await cookieFor("rr-delete")
      const offsetDays = freeOffset()
      const client = await ctx.client()
      await ctx.clientEmail(client.id)
      const policy = await ctx.policy({
        clientId: client.id,
        status: "active",
        expirationDate: isoDaysFromToday(offsetDays),
      })
      const rule = await ctx.reminderRule({ offsetDays })
      await request(app).post("/reminders/tick").set("Cookie", cookie)
      expect(await rowsFor(policy.id)).toHaveLength(1)

      const res = await request(app).delete(`/reminder-rules/${rule.id}`).set("Cookie", cookie)

      expect(res.status).toBe(204)
      expect(await rowsFor(policy.id)).toHaveLength(0)
    })
  })
})

// POST /reminders/tick is admin-only; helpers that need a pass run it with
// their own admin cookie so a staff-scoped test can still set up state.
async function tick() {
  const admin = await ctx.user("tick-helper", "admin")
  const cookie = await makeSessionCookie(admin.id)
  return request(app).post("/reminders/tick").set("Cookie", cookie)
}

describe("policy activities", () => {
  // Queues one reminder for a fresh policy and returns both. Ticks with its
  // own admin cookie, since POST /reminders/tick is admin-only and callers
  // here may be staff.
  async function queued() {
    const offsetDays = freeOffset()
    const client = await ctx.client()
    await ctx.clientEmail(client.id)
    const policy = await ctx.policy({
      clientId: client.id,
      status: "active",
      expirationDate: isoDaysFromToday(offsetDays),
    })
    const template = await ctx.template({ name: "Renewal Notice" })
    const rule = await ctx.reminderRule({ offsetDays, templateId: template.id, name: "30 days" })
    await tick()
    const [row] = await rowsFor(policy.id)
    return { policy, rule, row }
  }

  it("returns 401 without a cookie", async () => {
    expect((await request(app).get("/policies/1/activities")).status).toBe(401)
  })

  it("lists a queued reminder as a namespaced, cancellable activity", async () => {
    const cookie = await cookieFor("act-list")
    const { policy, row } = await queued()

    const res = await request(app).get(`/policies/${policy.id}/activities`).set("Cookie", cookie)

    expect(res.status).toBe(200)
    expect(res.body.activities).toHaveLength(1)
    const activity = res.body.activities[0]
    // Namespaced so a future task row can never collide on a numeric id.
    expect(activity.id).toBe(`scheduled-email:${row.id}`)
    expect(activity.kind).toBe("reminder")
    expect(activity.source).toBe("automation")
    expect(activity.title).toBe("30 days")
    expect(activity.detail).toBe("Renewal Notice")
    expect(activity.status).toBe("pending")
    expect(activity.cancellable).toBe(true)
  })

  it("does not leak another policy's activities", async () => {
    const cookie = await cookieFor("act-scope")
    await queued()
    const other = await ctx.policy()

    const res = await request(app).get(`/policies/${other.id}/activities`).set("Cookie", cookie)

    expect(res.body.activities).toEqual([])
  })

  it("empties out for an unknown policy rather than erroring", async () => {
    const cookie = await cookieFor("act-unknown")
    const res = await request(app).get("/policies/99999999/activities").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.activities).toEqual([])
  })
})

describe("scheduled emails", () => {
  async function queueOne() {
    const offsetDays = freeOffset()
    const client = await ctx.client()
    await ctx.clientEmail(client.id)
    const policy = await ctx.policy({
      clientId: client.id,
      status: "active",
      expirationDate: isoDaysFromToday(offsetDays),
    })
    await ctx.reminderRule({ offsetDays })
    await tick()
    const [row] = await rowsFor(policy.id)
    return { policy, row }
  }

  it("lists the agency-wide queue with client and policy context", async () => {
    const cookie = await cookieFor("sched-list")
    const { policy } = await queueOne()

    const res = await request(app).get("/scheduled-emails?status=pending").set("Cookie", cookie)

    expect(res.status).toBe(200)
    const found = res.body.scheduled.find((s: { policyId: number }) => s.policyId === policy.id)
    expect(found.policyNumber).toBe(policy.policyNumber)
    expect(found.clientName).toBeTruthy()
  })

  it("rejects an unknown status filter", async () => {
    const cookie = await cookieFor("sched-bad")
    const res = await request(app).get("/scheduled-emails?status=nope").set("Cookie", cookie)
    expect(res.status).toBe(400)
  })

  it("cancels a pending reminder", async () => {
    const cookie = await cookieFor("sched-cancel", "staff")
    const { row } = await queueOne()

    const res = await request(app)
      .post(`/scheduled-emails/${row.id}/cancel`)
      .set("Cookie", cookie)
      .send({})

    expect(res.status).toBe(200)
    expect(res.body.status).toBe("cancelled")
  })

  // The status guard lives in the UPDATE's WHERE, so a stale UI can't cancel
  // something already sent or in flight.
  it("409s when the reminder is no longer pending", async () => {
    const cookie = await cookieFor("sched-late", "staff")
    const { row } = await queueOne()
    await db.update(scheduledEmails).set({ status: "sent" }).where(eq(scheduledEmails.id, row.id))

    const res = await request(app)
      .post(`/scheduled-emails/${row.id}/cancel`)
      .set("Cookie", cookie)
      .send({})

    expect(res.status).toBe(409)
    expect(res.body.error).toContain("sent")
  })

  it("404s for an unknown reminder", async () => {
    const cookie = await cookieFor("sched-404", "staff")
    const res = await request(app)
      .post("/scheduled-emails/99999999/cancel")
      .set("Cookie", cookie)
      .send({})
    expect(res.status).toBe(404)
  })
})

describe("POST /reminders/tick", () => {
  it("rejects a staff user", async () => {
    const cookie = await cookieFor("tick-staff", "staff")
    expect((await request(app).post("/reminders/tick").set("Cookie", cookie)).status).toBe(403)
  })

  it("plans and dispatches in one pass", async () => {
    const cookie = await cookieFor("tick-admin")
    const res = await request(app).post("/reminders/tick").set("Cookie", cookie)
    expect(res.status).toBe(200)
    expect(res.body.plan).toBeDefined()
    expect(res.body.dispatch).toBeDefined()
  })
})
