// Shared fixtures for route integration tests. Not a *.test.ts file, so
// vitest's `src/**/*.test.ts` include pattern skips it.
import { randomInt } from "crypto"
import { inArray } from "drizzle-orm"
import { generateSessionToken, hashToken } from "../auth/tokens"
import { db } from "../db"
import {
  autoPolicies,
  carriers,
  clients,
  emailLog,
  emailTemplates,
  organizations,
  persons,
  reminderRules,
  sessions,
  users,
  vehicles,
} from "../db/schema"
import {
  addDriverToPolicy,
  addEmailToClient,
  createAutoPolicy,
  createCarrier,
  createClient,
  createCorrespondenceTemplate,
  createDriver,
  createMembership,
  createPerson,
  createPolicyLog,
  createReminderRule,
  createSession,
  createUser,
  createVehicle,
} from "../repositories"
import type {
  NewAutoPolicy,
  NewCarrier,
  NewClient,
  NewPerson,
  NewVehicle,
  Organization,
  ReminderRule,
  User,
  UserRole,
} from "../types"

// Vitest runs each test file in its own worker/module instance, so a
// per-module counter starting at 0 would collide across files running in
// parallel. Random digits avoid needing any cross-file coordination.
function randomDigits(length: number): string {
  let digits = ""
  for (let i = 0; i < length; i++) digits += randomInt(0, 10).toString()
  return digits
}

function unique(prefix: string): string {
  return `${prefix}${Date.now()}${randomDigits(6)}`
}

// naic/vin have tight length limits (10/17 chars), so these are built from
// digits directly rather than truncating a longer unique string, which would
// risk cutting off the random suffix and colliding.
function uniqueNaic(): string {
  return randomDigits(10)
}

function uniqueVin(): string {
  return randomDigits(17)
}

// An ISO date `days` from today, for lining a policy's expiration up with a
// rule's offset so the planner matches it.
export function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export async function makeTestUser(prefix: string): Promise<User> {
  return createUser({ email: `${unique(prefix)}@example.com` })
}

// orgId is required here (unlike TestContext.cookie(), which defaults to the
// context's org) since this module-level helper has no context to default
// from.
export async function makeSessionCookie(userId: number, orgId: number): Promise<string> {
  const token = generateSessionToken()
  await createSession({
    userId,
    orgId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return `session=${token}`
}

// Tracks fixture ids created during a test file so afterEach can clean them
// up in FK-safe order, since most of these tables have no single column
// (like `users.email`) that a LIKE-prefix cleanup could key off of.
export class TestContext {
  private userIds: number[] = []
  private personIds: number[] = []
  private clientIds: number[] = []
  private carrierIds: number[] = []
  private policyIds: number[] = []
  private vehicleIds: number[] = []
  private templateIds: number[] = []
  private ruleIds: number[] = []
  private orgIds: number[] = []
  // Set the first time org()/user() mints one, so repeated ctx.user() calls
  // with no explicit orgId land in the same org rather than each getting
  // their own - most tests need an actor and a target in one org together.
  private defaultOrgId?: number

  // Always inserts a fresh organization - the way to get a second, distinct
  // org for a cross-org test. The very first call also becomes the context's
  // default org (see defaultOrg()).
  async org(): Promise<Organization> {
    const [o] = await db
      .insert(organizations)
      .values({ name: unique("Test Org "), slug: unique("test-org-").slice(0, 64) })
      .returning()
    this.orgIds.push(o.id)
    this.defaultOrgId ??= o.id
    return o
  }

  private async defaultOrg(): Promise<number> {
    if (this.defaultOrgId !== undefined) return this.defaultOrgId
    return (await this.org()).id
  }

  async user(prefix: string, role: UserRole = "staff", orgId?: number) {
    const u = await makeTestUser(prefix)
    this.userIds.push(u.id)
    await createMembership({ userId: u.id, orgId: orgId ?? (await this.defaultOrg()), role })
    return u
  }

  // The mechanical replacement for a bare makeSessionCookie(userId) call:
  // defaults to the context's org instead of requiring every call site to
  // pass one.
  async cookie(userId: number, orgId?: number): Promise<string> {
    return makeSessionCookie(userId, orgId ?? (await this.defaultOrg()))
  }

  async person(overrides: Partial<NewPerson> = {}) {
    const p = await createPerson({
      firstName: unique("First"),
      lastName: "Test",
      dateOfBirth: "1990-01-01",
      gender: "m",
      relationToInsured: "self",
      ...overrides,
    })
    this.personIds.push(p.id)
    return p
  }

  async client(overrides: Partial<NewClient> = {}) {
    const namedInsuredId = overrides.namedInsuredId ?? (await this.person()).id
    const c = await createClient({
      mailingAddress1: "1 Test St",
      physicalAddress1: "1 Test St",
      ...overrides,
      namedInsuredId,
    })
    this.clientIds.push(c.id)
    return c
  }

  async carrier(overrides: Partial<NewCarrier> = {}) {
    const c = await createCarrier({ name: "Test Carrier", naic: uniqueNaic(), ...overrides })
    this.carrierIds.push(c.id)
    return c
  }

  async policy(overrides: Partial<NewAutoPolicy> = {}) {
    const clientId = overrides.clientId ?? (await this.client()).id
    const carrierId = overrides.carrierId ?? (await this.carrier()).id
    const p = await createAutoPolicy({
      policyNumber: unique("POL"),
      effectiveDate: "2026-01-01",
      expirationDate: "2027-01-01",
      ...overrides,
      clientId,
      carrierId,
    })
    this.policyIds.push(p.id)
    return p
  }

  async vehicle(overrides: Partial<NewVehicle> = {}) {
    const policyId = overrides.policyId ?? (await this.policy()).id
    const v = await createVehicle({
      vin: uniqueVin(),
      make: "Honda",
      model: "Civic",
      year: 2020,
      garagingZip: "12345",
      ...overrides,
      policyId,
    })
    this.vehicleIds.push(v.id)
    return v
  }

  // Creates a person + drivers row and links it to policyId. Driver rows
  // cascade-delete with their person, and policy_drivers links cascade-delete
  // with either side, so tracking the person is enough for cleanup.
  async driverLink(policyId: number, overrides: Partial<NewPerson> = {}) {
    const person = await this.person(overrides)
    const driver = await createDriver({ personId: person.id, dlNumber: unique("DL") })
    await addDriverToPolicy(policyId, driver.id)
    return { person, driver }
  }

  // policy_logs cascade-deletes with its policy, so no separate tracking
  // array is needed here - as long as the policy is tracked, cleanup() below
  // removes its logs before it removes the author's user row.
  async log(policyId: number, authorId: number, body = "Test log") {
    const l = await createPolicyLog({ policyId, authorId, body })
    if (!l) throw new Error(`Could not create log for policy ${policyId}`)
    return l
  }

  // client_emails cascade-delete with their client, so nothing to track.
  async clientEmail(clientId: number, email = `${unique("to")}@example.com`) {
    return addEmailToClient(clientId, email)
  }

  async template(overrides: { name?: string; subject?: string; body?: string } = {}) {
    const name = overrides.name ?? unique("Template ")
    const t = await createCorrespondenceTemplate({
      key: unique("correspondence-test-"),
      name,
      subject: overrides.subject ?? "Your policy {{policyNumber}}",
      body:
        overrides.body ?? "Hi {{clientFirstName}}, your policy expires {{policyExpirationDate}}.",
      updatedBy: null,
    })
    this.templateIds.push(t.id)
    return t
  }

  // offsetDays is random by default because reminder_rules is unique on
  // (trigger, offset_days) *globally*, and vitest runs test files in parallel
  // workers - two files both picking a natural-looking 30 would collide. Tests
  // that need the planner to match pass an offset and then build the policy
  // with isoDaysFromToday(offset), which lines the two up.
  async reminderRule(
    overrides: { offsetDays?: number; templateId?: number; enabled?: boolean; name?: string } = {}
  ): Promise<ReminderRule> {
    const templateId = overrides.templateId ?? (await this.template()).id
    const rule = await createReminderRule({
      name: overrides.name ?? unique("Rule "),
      trigger: "policy_expiration",
      offsetDays: overrides.offsetDays ?? randomInt(100_000, 1_000_000),
      templateId,
      enabled: overrides.enabled ?? true,
      updatedBy: null,
    })
    this.ruleIds.push(rule.id)
    return rule
  }

  // Registers a row created some other way (e.g. through an API call under
  // test rather than via this context's own builders) so cleanup still
  // removes it.
  track(
    kind: "person" | "client" | "carrier" | "policy" | "vehicle" | "user" | "rule" | "template",
    id: number
  ) {
    switch (kind) {
      case "person":
        this.personIds.push(id)
        break
      case "client":
        this.clientIds.push(id)
        break
      case "carrier":
        this.carrierIds.push(id)
        break
      case "policy":
        this.policyIds.push(id)
        break
      case "vehicle":
        this.vehicleIds.push(id)
        break
      case "user":
        this.userIds.push(id)
        break
      case "rule":
        this.ruleIds.push(id)
        break
      case "template":
        this.templateIds.push(id)
        break
    }
  }

  async cleanup() {
    // Sessions first: sessions.org_id has no ON DELETE clause (schema.ts), so
    // a session for a tracked user must be gone before organizations below is
    // deleted. Deleting users would cascade these away too (sessions.user_id
    // does cascade), but doing it explicitly here decouples the ordering from
    // that FK rather than relying on it.
    if (this.userIds.length) await db.delete(sessions).where(inArray(sessions.userId, this.userIds))

    // Rules first: scheduled_emails cascades from them, and email_templates
    // is referenced with no cascade so it can only go once its rules have.
    if (this.ruleIds.length)
      await db.delete(reminderRules).where(inArray(reminderRules.id, this.ruleIds))
    if (this.templateIds.length)
      await db.delete(emailTemplates).where(inArray(emailTemplates.id, this.templateIds))
    if (this.vehicleIds.length)
      await db.delete(vehicles).where(inArray(vehicles.id, this.vehicleIds))
    if (this.policyIds.length)
      await db.delete(autoPolicies).where(inArray(autoPolicies.id, this.policyIds))
    if (this.clientIds.length) await db.delete(clients).where(inArray(clients.id, this.clientIds))
    if (this.personIds.length) await db.delete(persons).where(inArray(persons.id, this.personIds))
    if (this.carrierIds.length)
      await db.delete(carriers).where(inArray(carriers.id, this.carrierIds))
    if (this.userIds.length) {
      // email_log.triggered_by has no cascade delete, so any log rows
      // created by a tracked user must be removed before the user itself.
      await db.delete(emailLog).where(inArray(emailLog.triggeredBy, this.userIds))
      await db.delete(users).where(inArray(users.id, this.userIds))
    }
    // Organizations last: org_memberships cascades from both users and
    // organizations, so it needs neither side deleted first, but everything
    // above (sessions, users) that references an org must already be gone.
    if (this.orgIds.length)
      await db.delete(organizations).where(inArray(organizations.id, this.orgIds))
  }
}
