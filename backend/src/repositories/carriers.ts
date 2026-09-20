import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { carriers } from "../db/schema"
import type { Carrier, NewCarrier } from "../types"

export async function listCarriers(orgId: string): Promise<Carrier[]> {
  return db.select().from(carriers).where(eq(carriers.orgId, orgId))
}

export async function findCarrierById(orgId: string, id: string): Promise<Carrier | undefined> {
  const [row] = await db
    .select()
    .from(carriers)
    .where(and(eq(carriers.id, id), eq(carriers.orgId, orgId)))
  return row
}

export async function createCarrier(
  orgId: string,
  input: Omit<NewCarrier, "orgId">
): Promise<Carrier> {
  const [row] = await db
    .insert(carriers)
    .values({ ...input, orgId })
    .returning()
  return row
}

export async function updateCarrier(
  orgId: string,
  id: string,
  input: Partial<Omit<NewCarrier, "orgId">>
): Promise<Carrier | undefined> {
  const [row] = await db
    .update(carriers)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(carriers.id, id), eq(carriers.orgId, orgId)))
    .returning()
  return row
}

export async function deleteCarrier(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(carriers)
    .where(and(eq(carriers.id, id), eq(carriers.orgId, orgId)))
    .returning({ id: carriers.id })
  return deleted.length > 0
}
