import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { policyDrivers } from "../db/schema"
import type { PolicyDriver } from "../types"

export async function listDriversForPolicy(policyId: string) {
  return db.query.policyDrivers.findMany({
    where: eq(policyDrivers.policyId, policyId),
    with: { driver: { with: { person: true } } },
  })
}

export async function listPoliciesForDriver(driverId: string) {
  return db.query.policyDrivers.findMany({
    where: eq(policyDrivers.driverId, driverId),
    with: { policy: true },
  })
}

export async function addDriverToPolicy(policyId: string, driverId: string): Promise<PolicyDriver> {
  const [row] = await db.insert(policyDrivers).values({ policyId, driverId }).returning()
  return row
}

export async function removeDriverFromPolicy(policyId: string, driverId: string): Promise<boolean> {
  const deleted = await db
    .delete(policyDrivers)
    .where(and(eq(policyDrivers.policyId, policyId), eq(policyDrivers.driverId, driverId)))
    .returning({ id: policyDrivers.id })
  return deleted.length > 0
}
