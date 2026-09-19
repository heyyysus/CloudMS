import { sql } from "drizzle-orm"
import { db } from "../index"
import {
  autoPolicies,
  carriers,
  clients,
  invoiceItems,
  invoices,
  payments,
  persons,
  policyDrivers,
  policyLogs,
  receipts,
  trustLedger,
  users,
  vehicles,
} from "../schema"
import { seedCarriers } from "./carriers"
import { seedFinancials } from "./financials"
import { seedHouseholds } from "./households"
import { seedPolicies } from "./policies"
import { seedUsers } from "./users"
import { wipe } from "./wipe"

const CLIENT_COUNT = 100
const POLICY_COUNT = 300

export async function seed(): Promise<void> {
  await wipe()

  const seededUsers = await seedUsers()
  const seededCarriers = await seedCarriers()
  const households = await seedHouseholds(CLIENT_COUNT)
  const policies = await seedPolicies(households, seededCarriers, POLICY_COUNT)
  await seedFinancials(policies, seededUsers)

  const [[u], [c], [p], [cl], [ap], [v], [pd], [pl], [inv], [ii], [pay], [rc], [tl]] =
    await Promise.all([
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
