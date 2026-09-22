// Shared fixtures for route integration tests. Not a *.test.ts file, so
// vitest's `src/**/*.test.ts` include pattern skips it.
import { randomInt } from "crypto"
import { inArray } from "drizzle-orm"
import { generateSessionToken, hashToken } from "../auth/tokens"
import { adminDb, runInOrg } from "../db"
import {
  autoPolicies,
  carriers,
  clients,
  drivers,
  emailLog,
  emailTemplates,
  organizations,
  persons,
  reminderRules,
  sessions,
  users,
  vehicles,
} from "../db/schema"
import { WELCOME_TEMPLATE_KEY } from "../emails"
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
  upsertEmailTemplate,
} from "../repositories"
import type {
  NewAutoPolicy,
  NewCarrier,
  NewClient,
  NewOrganization,
  NewPerson,
  NewVehicle,
  Organization,
  ReminderRule,
  User,
  UserRole,
} from "../types"

// Re-exported so repository-level tests that call a repository directly
// (outside a request, where requireAuth would normally open this) have one
// obvious import to wrap those calls with.
export { runInOrg }

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

// A well-formed row id that was never inserted, for tests that need "no row
// has this id" rather than "this isn't a valid id" (see routes/helpers.ts's
// parseId - the two are answered identically, 404, but tests exercising the
// not-found path should use this rather than a malformed string).
export const MISSING_ROW_ID = "AAAAAAAAAAAAAAAAAAAAAA"

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
export async function makeSessionCookie(userId: string, orgId: string): Promise<string> {
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
  private userIds: string[] = []
  private personIds: string[] = []
  private clientIds: string[] = []
  private carrierIds: string[] = []
  private policyIds: string[] = []
  private vehicleIds: string[] = []
  private templateIds: string[] = []
  private ruleIds: string[] = []
  private orgIds: string[] = []
  // Set the first time org()/user() mints one, so repeated ctx.user() calls
  // with no explicit orgId land in the same org rather than each getting
  // their own - most tests need an actor and a target in one org together.
  private defaultOrgId?: string

  // Always inserts a fresh organization - the way to get a second, distinct
  // org for a cross-org test. The very first call also becomes the context's
  // default org (see defaultOrg()). Seeds a welcome template too, mirroring
  // what bootstrap.ts/seed/run.ts do for a real organization - without one,
  // sendWelcomeEmail (invite, resend-welcome, restore) 500s for every org
  // this context mints.
  async org(overrides: Partial<NewOrganization> = {}): Promise<Organization> {
    // adminDb, not db: organizations isn't RLS-protected (see rls.ts), but
    // this insert can run before any org context exists to scope it to, same
    // as bootstrap.ts/seed/run.ts creating a real organization.
    const [o] = await adminDb
      .insert(organizations)
      .values({
        name: unique("Test Org "),
        slug: unique("test-org-").slice(0, 64),
        ...overrides,
      })
      .returning()
    this.orgIds.push(o.id)
    this.defaultOrgId ??= o.id
    // A tenant row, unlike the insert above, so it runs on db inside this
    // org's context rather than adminDb.
    await runInOrg(o.id, () =>
      upsertEmailTemplate(o.id, {
        key: WELCOME_TEMPLATE_KEY,
        subject: "Welcome to CloudMS, {{name}}",
        body: "Hi {{name}}, {{inviterName}} has invited you as {{role}}. Sign in at {{appUrl}}.",
        updatedBy: null,
      })
    )
    return o
  }

  private async defaultOrg(): Promise<string> {
    if (this.defaultOrgId !== undefined) return this.defaultOrgId
    return (await this.org()).id
  }

  // Public accessor over defaultOrg(), for tests that need to name the
  // session's own org explicitly (e.g. to contrast it with a second ctx.org()).
  async orgId(): Promise<string> {
    return this.defaultOrg()
  }

  async user(prefix: string, role: UserRole = "staff", orgId?: string) {
    const u = await makeTestUser(prefix)
    this.userIds.push(u.id)
    await createMembership({ userId: u.id, orgId: orgId ?? (await this.defaultOrg()), role })
    return u
  }

  // The mechanical replacement for a bare makeSessionCookie(userId) call:
  // defaults to the context's org instead of requiring every call site to
  // pass one.
  async cookie(userId: string, orgId?: string): Promise<string> {
    return makeSessionCookie(userId, orgId ?? (await this.defaultOrg()))
  }

  async person(overrides: Partial<NewPerson> = {}) {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const p = await runInOrg(resolvedOrgId, () =>
      createPerson(resolvedOrgId, {
        firstName: unique("First"),
        lastName: "Test",
        dateOfBirth: "1990-01-01",
        gender: "m",
        relationToInsured: "self",
        ...rest,
      })
    )
    this.personIds.push(p.id)
    return p
  }

  async client(overrides: Partial<NewClient> = {}) {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const namedInsuredId = rest.namedInsuredId ?? (await this.person({ orgId: resolvedOrgId })).id
    const c = await runInOrg(resolvedOrgId, () =>
      createClient(resolvedOrgId, {
        mailingAddress1: "1 Test St",
        physicalAddress1: "1 Test St",
        ...rest,
        namedInsuredId,
      })
    )
    this.clientIds.push(c.id)
    return c
  }

  async carrier(overrides: Partial<NewCarrier> = {}) {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const c = await runInOrg(resolvedOrgId, () =>
      createCarrier(resolvedOrgId, {
        name: "Test Carrier",
        naic: uniqueNaic(),
        ...rest,
      })
    )
    this.carrierIds.push(c.id)
    return c
  }

  async policy(overrides: Partial<NewAutoPolicy> = {}) {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const clientId = rest.clientId ?? (await this.client({ orgId: resolvedOrgId })).id
    const carrierId = rest.carrierId ?? (await this.carrier({ orgId: resolvedOrgId })).id
    const p = await runInOrg(resolvedOrgId, () =>
      createAutoPolicy(resolvedOrgId, {
        policyNumber: unique("POL"),
        effectiveDate: "2026-01-01",
        expirationDate: "2027-01-01",
        ...rest,
        clientId,
        carrierId,
      })
    )
    this.policyIds.push(p.id)
    return p
  }

  async vehicle(overrides: Partial<NewVehicle> = {}) {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const policyId = rest.policyId ?? (await this.policy({ orgId: resolvedOrgId })).id
    const v = await runInOrg(resolvedOrgId, () =>
      createVehicle(resolvedOrgId, {
        vin: uniqueVin(),
        make: "Honda",
        model: "Civic",
        year: 2020,
        garagingZip: "12345",
        ...rest,
        policyId,
      })
    )
    this.vehicleIds.push(v.id)
    return v
  }

  // Creates a person + drivers row and links it to policyId. Driver rows
  // cascade-delete with their person, and policy_drivers links cascade-delete
  // with either side, so tracking the person is enough for cleanup.
  async driverLink(policyId: string, overrides: Partial<NewPerson> = {}) {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const person = await this.person({ orgId: resolvedOrgId, ...rest })
    const driver = await runInOrg(resolvedOrgId, () =>
      createDriver(resolvedOrgId, {
        personId: person.id,
        dlNumber: unique("DL"),
      })
    )
    await runInOrg(resolvedOrgId, () => addDriverToPolicy(resolvedOrgId, policyId, driver.id))
    return { person, driver }
  }

  // policy_logs cascade-deletes with its policy, so no separate tracking
  // array is needed here - as long as the policy is tracked, cleanup() below
  // removes its logs before it removes the author's user row.
  async log(policyId: string, authorId: string, body = "Test log", orgId?: string) {
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const l = await runInOrg(resolvedOrgId, () =>
      createPolicyLog(resolvedOrgId, {
        policyId,
        authorId,
        body,
      })
    )
    if (!l) throw new Error(`Could not create log for policy ${policyId}`)
    return l
  }

  // client_emails cascade-delete with their client, so nothing to track.
  async clientEmail(clientId: string, email = `${unique("to")}@example.com`, orgId?: string) {
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    return runInOrg(resolvedOrgId, () => addEmailToClient(resolvedOrgId, clientId, email))
  }

  async template(
    overrides: { name?: string; subject?: string; body?: string; orgId?: string } = {}
  ) {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const name = rest.name ?? unique("Template ")
    const t = await runInOrg(resolvedOrgId, () =>
      createCorrespondenceTemplate(resolvedOrgId, {
        key: unique("correspondence-test-"),
        name,
        subject: rest.subject ?? "Your policy {{policyNumber}}",
        body: rest.body ?? "Hi {{clientFirstName}}, your policy expires {{policyExpirationDate}}.",
        updatedBy: null,
      })
    )
    this.templateIds.push(t.id)
    return t
  }

  // reminder_rules is now unique per org (trigger, offset_days), so two test
  // files in different orgs can no longer collide on a natural-looking
  // offset. offsetDays stays random by default anyway - it's also what keeps
  // a parallel worker's planner run from matching this test's policies, which
  // the org scope alone wouldn't prevent within the same org. Tests that need
  // the planner to match pass an offset and then build the policy with
  // isoDaysFromToday(offset), which lines the two up.
  async reminderRule(
    overrides: {
      offsetDays?: number
      templateId?: string
      enabled?: boolean
      name?: string
      orgId?: string
    } = {}
  ): Promise<ReminderRule> {
    const { orgId, ...rest } = overrides
    const resolvedOrgId = orgId ?? (await this.defaultOrg())
    const templateId = rest.templateId ?? (await this.template({ orgId: resolvedOrgId })).id
    const rule = await runInOrg(resolvedOrgId, () =>
      createReminderRule(resolvedOrgId, {
        name: rest.name ?? unique("Rule "),
        trigger: "policy_expiration",
        offsetDays: rest.offsetDays ?? randomInt(100_000, 1_000_000),
        templateId,
        enabled: rest.enabled ?? true,
        updatedBy: null,
      })
    )
    this.ruleIds.push(rule.id)
    return rule
  }

  // Registers a row created some other way (e.g. through an API call under
  // test rather than via this context's own builders) so cleanup still
  // removes it.
  track(
    kind: "person" | "client" | "carrier" | "policy" | "vehicle" | "user" | "rule" | "template",
    id: string
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
    if (this.userIds.length)
      await adminDb.delete(sessions).where(inArray(sessions.userId, this.userIds))

    // Rules first: scheduled_emails cascades from them, and email_templates
    // is referenced with no cascade so it can only go once its rules have.
    if (this.ruleIds.length)
      await adminDb.delete(reminderRules).where(inArray(reminderRules.id, this.ruleIds))
    if (this.templateIds.length)
      await adminDb.delete(emailTemplates).where(inArray(emailTemplates.id, this.templateIds))
    if (this.vehicleIds.length)
      await adminDb.delete(vehicles).where(inArray(vehicles.id, this.vehicleIds))
    if (this.policyIds.length)
      await adminDb.delete(autoPolicies).where(inArray(autoPolicies.id, this.policyIds))
    if (this.clientIds.length)
      await adminDb.delete(clients).where(inArray(clients.id, this.clientIds))
    if (this.personIds.length)
      await adminDb.delete(persons).where(inArray(persons.id, this.personIds))
    if (this.carrierIds.length)
      await adminDb.delete(carriers).where(inArray(carriers.id, this.carrierIds))
    if (this.userIds.length) {
      // email_log.triggered_by has no cascade delete, so any log rows
      // created by a tracked user must be removed before the user itself.
      await adminDb.delete(emailLog).where(inArray(emailLog.triggeredBy, this.userIds))
      await adminDb.delete(users).where(inArray(users.id, this.userIds))
    }
    // Organizations last: org_memberships cascades from both users and
    // organizations, so it needs neither side deleted first, but everything
    // above (sessions, users) that references an org must already be gone.
    if (this.orgIds.length) {
      // upsertEmailTemplate can mint a row scoped to a tracked org (e.g. the
      // welcome-template PUT route) without going through template(), so it
      // is never in templateIds. Sweep by org here too, or the FK from
      // email_templates.org_id blocks the delete below.
      await adminDb.delete(emailTemplates).where(inArray(emailTemplates.orgId, this.orgIds))
      // The userIds sweep above only catches email_log rows triggered by a
      // tracked user; a send triggered by the automation user (scheduler
      // tests) is not, so sweep by org too, or the FK from email_log.org_id
      // blocks the delete below.
      await adminDb.delete(emailLog).where(inArray(emailLog.orgId, this.orgIds))
      // A nested "new" driver spec on a policy create/update (routes/policies.ts,
      // autoPolicies.ts's linkPolicyDrivers) creates its person+driver rows
      // server-side, so their ids never reach personIds above. Sweep both by
      // org here too, or drivers.org_id/persons.org_id block the delete below.
      await adminDb.delete(drivers).where(inArray(drivers.orgId, this.orgIds))
      await adminDb.delete(persons).where(inArray(persons.orgId, this.orgIds))
      await adminDb.delete(organizations).where(inArray(organizations.id, this.orgIds))
      this.orgIds = []
    }
    // cleanup() runs in afterEach, so a cached default org is gone the moment
    // this returns - the next test's user()/cookie() must mint a new one
    // rather than reuse an id that no longer exists.
    this.defaultOrgId = undefined
  }
}
