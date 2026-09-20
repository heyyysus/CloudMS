import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, vehicles } from "../db/schema"
import type { NewVehicle, Vehicle } from "../types"
import { CrossOrgReferenceError } from "./errors"

export async function listVehicles(orgId: string): Promise<Vehicle[]> {
  return db.select().from(vehicles).where(eq(vehicles.orgId, orgId))
}

export async function listVehiclesByPolicyId(orgId: string, policyId: string): Promise<Vehicle[]> {
  return db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.policyId, policyId), eq(vehicles.orgId, orgId)))
}

export async function findVehicleById(orgId: string, id: string): Promise<Vehicle | undefined> {
  const [row] = await db
    .select()
    .from(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
  return row
}

export async function createVehicle(
  orgId: string,
  input: Omit<NewVehicle, "orgId">
): Promise<Vehicle> {
  return db.transaction(async (tx) => {
    const [policy] = await tx
      .select()
      .from(autoPolicies)
      .where(and(eq(autoPolicies.id, input.policyId), eq(autoPolicies.orgId, orgId)))
    if (!policy) throw new CrossOrgReferenceError()

    const [row] = await tx
      .insert(vehicles)
      .values({ ...input, orgId })
      .returning()
    return row
  })
}

export async function updateVehicle(
  orgId: string,
  id: string,
  input: Partial<Omit<NewVehicle, "orgId">>
): Promise<Vehicle | undefined> {
  return db.transaction(async (tx) => {
    if (input.policyId !== undefined) {
      const [policy] = await tx
        .select()
        .from(autoPolicies)
        .where(and(eq(autoPolicies.id, input.policyId), eq(autoPolicies.orgId, orgId)))
      if (!policy) throw new CrossOrgReferenceError()
    }

    const [row] = await tx
      .update(vehicles)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
      .returning()
    return row
  })
}

export async function deleteVehicle(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(vehicles)
    .where(and(eq(vehicles.id, id), eq(vehicles.orgId, orgId)))
    .returning({ id: vehicles.id })
  return deleted.length > 0
}
