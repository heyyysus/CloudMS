import { eq } from "drizzle-orm"
import { db } from "../db"
import { vehicles } from "../db/schema"
import type { NewVehicle, Vehicle } from "../types"

export async function listVehicles(): Promise<Vehicle[]> {
  return db.select().from(vehicles)
}

export async function listVehiclesByPolicyId(policyId: number): Promise<Vehicle[]> {
  return db.select().from(vehicles).where(eq(vehicles.policyId, policyId))
}

export async function findVehicleById(id: number): Promise<Vehicle | undefined> {
  const [row] = await db.select().from(vehicles).where(eq(vehicles.id, id))
  return row
}

export async function createVehicle(input: NewVehicle): Promise<Vehicle> {
  const [row] = await db.insert(vehicles).values(input).returning()
  return row
}

export async function updateVehicle(
  id: number,
  input: Partial<NewVehicle>
): Promise<Vehicle | undefined> {
  const [row] = await db
    .update(vehicles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(vehicles.id, id))
    .returning()
  return row
}

export async function deleteVehicle(id: number): Promise<boolean> {
  const deleted = await db
    .delete(vehicles)
    .where(eq(vehicles.id, id))
    .returning({ id: vehicles.id })
  return deleted.length > 0
}
