import { inArray, sql } from "drizzle-orm"
import { adminDb as db } from "../index"
import {
  autoPolicies,
  carriers,
  clients,
  emailTemplates,
  invoiceItems,
  invoices,
  orgMemberships,
  organizations,
  payments,
  persons,
  policyDrivers,
  policyLogs,
  receipts,
  trustLedger,
  users,
  vehicles,
} from "../schema"
import { CARRIER_COUNT, SECOND_ORG_CARRIER_COUNT, seedCarriers } from "./carriers"
import { seedFinancials } from "./financials"
import { seedHouseholds } from "./households"
import { seedOrganizations } from "./organizations"
import { seedPolicies } from "./policies"
import { seedUsers } from "./users"
import { wipe } from "./wipe"

const CLIENT_COUNT = 100
const POLICY_COUNT = 300
const SECOND_ORG_CLIENT_COUNT = 5
const SECOND_ORG_POLICY_COUNT = 2

const WELCOME_TEMPLATE_BODY = `Hi {{name}},

{{inviterName}} has invited you to CloudMS as {{role}}.

Sign in with your Google account ({{email}}) at {{appUrl}} - no password needed, access is already set up for this address.`

async function seedWelcomeTemplate(orgId: number): Promise<void> {
  await db.insert(emailTemplates).values({
    orgId,
    key: "welcome",
    kind: "welcome",
    subject: "Welcome to CloudMS, {{name}}",
    body: WELCOME_TEMPLATE_BODY,
  })
}

// createAutoPolicyWithDetails (used by seedPolicies) takes no orgId in this
// sub-issue, so the second org's policies land in org 1 via the column
// default and need moving afterwards. Temporary until sub-issue 4 threads
// orgId through the policy repositories directly.
async function reassignPoliciesToOrg(orgId: number, policyIds: number[]): Promise<void> {
  if (policyIds.length === 0) return
  await db.update(autoPolicies).set({ orgId }).where(inArray(autoPolicies.id, policyIds))
  await db.update(vehicles).set({ orgId }).where(inArray(vehicles.policyId, policyIds))
  await db.update(policyDrivers).set({ orgId }).where(inArray(policyDrivers.policyId, policyIds))
  await db.update(policyLogs).set({ orgId }).where(inArray(policyLogs.policyId, policyIds))
}

export async function seed(): Promise<void> {
  await wipe()

  const [defaultOrg, secondOrg] = await seedOrganizations()

  const usedEmails = new Set<string>()
  const usedNaics = new Set<string>()

  const seededUsers = await seedUsers(defaultOrg.id, usedEmails, {
    staffCount: 5,
    adminAmongStaff: 2,
    includeAdmin: true,
  })
  const seededCarriers = await seedCarriers(defaultOrg.id, CARRIER_COUNT, usedNaics)
  const households = await seedHouseholds(CLIENT_COUNT, defaultOrg.id)
  const policies = await seedPolicies(households, seededCarriers, POLICY_COUNT)
  await seedFinancials(policies, seededUsers)
  await seedWelcomeTemplate(defaultOrg.id)

  await seedUsers(secondOrg.id, usedEmails, {
    staffCount: 2,
    includeAdmin: true,
  })
  const secondOrgCarriers = await seedCarriers(secondOrg.id, SECOND_ORG_CARRIER_COUNT, usedNaics)
  const secondOrgHouseholds = await seedHouseholds(SECOND_ORG_CLIENT_COUNT, secondOrg.id)
  // pickPolicyCounts (in seedPolicies) gives every household at least one
  // policy, so fewer policies than households means only a subset of
  // households gets one - the rest are clients with no policy yet, same as a
  // real prospect.
  const secondOrgPolicies = await seedPolicies(
    secondOrgHouseholds.slice(0, SECOND_ORG_POLICY_COUNT),
    secondOrgCarriers,
    SECOND_ORG_POLICY_COUNT,
    "POL2"
  )
  await reassignPoliciesToOrg(
    secondOrg.id,
    secondOrgPolicies.map((p) => p.id)
  )
  await seedWelcomeTemplate(secondOrg.id)

  const [[org], [om], [u], [c], [p], [cl], [ap], [v], [pd], [pl], [inv], [ii], [pay], [rc], [tl]] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(organizations),
      db.select({ count: sql<number>`count(*)` }).from(orgMemberships),
      db.select({ count: sql<number>`count(*)` }).from(users),
      db.select({ count: sql<number>`count(*)` }).from(carriers),
      db.select({ count: sql<number>`count(*)` }).from(persons),
      db.select({ count: sql<number>`count(*)` }).from(clients),
      db.select({ count: sql<number>`count(*)` }).from(autoPolicies),
      db.select({ count: sql<number>`count(*)` }).from(vehicles),
      db.select({ count: sql<number>`count(*)` }).from(policyDrivers),
      db.select({ count: sql<number>`count(*)` }).from(policyLogs),
      db.select({ count: sql<number>`count(*)` }).from(invoices),
      db.select({ count: sql<number>`count(*)` }).from(invoiceItems),
      db.select({ count: sql<number>`count(*)` }).from(payments),
      db.select({ count: sql<number>`count(*)` }).from(receipts),
      db.select({ count: sql<number>`count(*)` }).from(trustLedger),
    ])

  console.log("\n=== Row counts ===")
  console.table({
    organizations: org.count,
    org_memberships: om.count,
    users: u.count,
    carriers: c.count,
    persons: p.count,
    clients: cl.count,
    auto_policies: ap.count,
    vehicles: v.count,
    policy_drivers: pd.count,
    policy_logs: pl.count,
    invoices: inv.count,
    invoice_items: ii.count,
    payments: pay.count,
    receipts: rc.count,
    trust_ledger: tl.count,
  })
}
