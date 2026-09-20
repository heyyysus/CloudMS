import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { drivers, persons } from "../db/schema"
import type { Driver, NewDriver } from "../types"
import { CrossOrgReferenceError } from "./errors"

export async function listDrivers(orgId: string): Promise<Driver[]> {
  return db.select().from(drivers).where(eq(drivers.orgId, orgId))
}

export async function findDriverById(orgId: string, id: string): Promise<Driver | undefined> {
  const [row] = await db
    .select()
    .from(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.orgId, orgId)))
  return row
}

export async function createDriver(
  orgId: string,
  input: Omit<NewDriver, "orgId">
): Promise<Driver> {
  return db.transaction(async (tx) => {
    const [person] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.id, input.personId), eq(persons.orgId, orgId)))
    if (!person) throw new CrossOrgReferenceError()

    const [row] = await tx
      .insert(drivers)
      .values({ ...input, orgId })
      .returning()
    return row
  })
}

export async function updateDriver(
  orgId: string,
  id: string,
  input: Partial<Omit<NewDriver, "orgId">>
): Promise<Driver | undefined> {
  return db.transaction(async (tx) => {
    if (input.personId !== undefined) {
      const [person] = await tx
        .select()
        .from(persons)
        .where(and(eq(persons.id, input.personId), eq(persons.orgId, orgId)))
      if (!person) throw new CrossOrgReferenceError()
    }

    const [row] = await tx
      .update(drivers)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(drivers.id, id), eq(drivers.orgId, orgId)))
      .returning()
    return row
  })
}

export async function deleteDriver(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(drivers)
    .where(and(eq(drivers.id, id), eq(drivers.orgId, orgId)))
    .returning({ id: drivers.id })
  return deleted.length > 0
}
