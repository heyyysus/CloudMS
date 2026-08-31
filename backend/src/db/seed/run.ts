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
import { resetRng } from "./rng"
import { seedUsers } from "./users"
import { wipe, type WipeOptions } from "./wipe"

const CLIENT_COUNT = 100
const POLICY_COUNT = 300

export type SeedOptions = WipeOptions

export interface SeedCounts {
  users: number
  carriers: number
  persons: number
  clients: number
  autoPolicies: number
  vehicles: number
  policyDrivers: number
  policyLogs: number
  invoices: number
  invoiceItems: number
  payments: number
  receipts: number
  trustLedger: number
}

export async function seed(options: SeedOptions = {}): Promise<SeedCounts> {
  // Re-applied on every call, not just at module load, so a second seed() in
  // the same process (the demo reseed job) regenerates the same reproducible
  // dataset instead of continuing the faker stream into different data.
  resetRng()
  await wipe(options)

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

  return {
    users: u.count,
    carriers: c.count,
    persons: p.count,
    clients: cl.count,
    autoPolicies: ap.count,
    vehicles: v.count,
    policyDrivers: pd.count,
    policyLogs: pl.count,
    invoices: inv.count,
    invoiceItems: ii.count,
    payments: pay.count,
    receipts: rc.count,
    trustLedger: tl.count,
  }
}
