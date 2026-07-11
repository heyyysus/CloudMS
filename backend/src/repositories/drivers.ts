import { eq } from "drizzle-orm"
import { db } from "../db"
import { drivers } from "../db/schema"
import type { Driver, NewDriver } from "../types"

export async function listDrivers(): Promise<Driver[]> {
  return db.select().from(drivers)
}

export async function findDriverById(id: number): Promise<Driver | undefined> {
  const [row] = await db.select().from(drivers).where(eq(drivers.id, id))
  return row
}

export async function createDriver(input: NewDriver): Promise<Driver> {
  const [row] = await db.insert(drivers).values(input).returning()
  return row
}

export async function updateDriver(
  id: number,
  input: Partial<NewDriver>
): Promise<Driver | undefined> {
  const [row] = await db
    .update(drivers)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(drivers.id, id))
    .returning()
  return row
}

export async function deleteDriver(id: number): Promise<boolean> {
  const deleted = await db.delete(drivers).where(eq(drivers.id, id)).returning({ id: drivers.id })
  return deleted.length > 0
}
