import { eq } from "drizzle-orm"
import { db } from "../db"
import { carriers } from "../db/schema"
import type { Carrier, NewCarrier } from "../types"

export async function listCarriers(): Promise<Carrier[]> {
  return db.select().from(carriers)
}

export async function findCarrierById(id: number): Promise<Carrier | undefined> {
  const [row] = await db.select().from(carriers).where(eq(carriers.id, id))
  return row
}

export async function createCarrier(input: NewCarrier): Promise<Carrier> {
  const [row] = await db.insert(carriers).values(input).returning()
  return row
}

export async function updateCarrier(
  id: number,
  input: Partial<NewCarrier>
): Promise<Carrier | undefined> {
  const [row] = await db
    .update(carriers)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(carriers.id, id))
    .returning()
  return row
}

export async function deleteCarrier(id: number): Promise<boolean> {
  const deleted = await db
    .delete(carriers)
    .where(eq(carriers.id, id))
    .returning({ id: carriers.id })
  return deleted.length > 0
}
