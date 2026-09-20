import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, drivers, policyDrivers } from "../db/schema"
import type { PolicyDriver } from "../types"
import { CrossOrgReferenceError } from "./errors"

export async function listDriversForPolicy(orgId: string, policyId: string) {
  return db.query.policyDrivers.findMany({
    where: and(eq(policyDrivers.policyId, policyId), eq(policyDrivers.orgId, orgId)),
    with: { driver: { with: { person: true } } },
  })
}

export async function listPoliciesForDriver(orgId: string, driverId: string) {
  return db.query.policyDrivers.findMany({
    where: and(eq(policyDrivers.driverId, driverId), eq(policyDrivers.orgId, orgId)),
    with: { policy: true },
  })
}

export async function addDriverToPolicy(
  orgId: string,
  policyId: string,
  driverId: string
): Promise<PolicyDriver> {
  return db.transaction(async (tx) => {
    const [policy] = await tx
      .select({ id: autoPolicies.id })
      .from(autoPolicies)
      .where(and(eq(autoPolicies.id, policyId), eq(autoPolicies.orgId, orgId)))
    if (!policy) throw new CrossOrgReferenceError()

    const [driver] = await tx
      .select({ id: drivers.id })
      .from(drivers)
      .where(and(eq(drivers.id, driverId), eq(drivers.orgId, orgId)))
    if (!driver) throw new CrossOrgReferenceError()

    const [row] = await tx.insert(policyDrivers).values({ policyId, driverId, orgId }).returning()
    return row
  })
}

export async function removeDriverFromPolicy(
  orgId: string,
  policyId: string,
  driverId: string
): Promise<boolean> {
  const deleted = await db
    .delete(policyDrivers)
    .where(
      and(
        eq(policyDrivers.policyId, policyId),
        eq(policyDrivers.driverId, driverId),
        eq(policyDrivers.orgId, orgId)
      )
    )
    .returning({ id: policyDrivers.id })
  return deleted.length > 0
}
