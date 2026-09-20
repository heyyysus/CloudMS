import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { persons } from "../db/schema"
import type { NewPerson, Person } from "../types"

export async function listPersons(orgId: string): Promise<Person[]> {
  return db.select().from(persons).where(eq(persons.orgId, orgId))
}

export async function findPersonById(orgId: string, id: string): Promise<Person | undefined> {
  const [row] = await db
    .select()
    .from(persons)
    .where(and(eq(persons.id, id), eq(persons.orgId, orgId)))
  return row
}

export async function createPerson(
  orgId: string,
  input: Omit<NewPerson, "orgId">
): Promise<Person> {
  const [row] = await db
    .insert(persons)
    .values({ ...input, orgId })
    .returning()
  return row
}

export async function updatePerson(
  orgId: string,
  id: string,
  input: Partial<Omit<NewPerson, "orgId">>
): Promise<Person | undefined> {
  const [row] = await db
    .update(persons)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(persons.id, id), eq(persons.orgId, orgId)))
    .returning()
  return row
}

export async function deletePerson(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(persons)
    .where(and(eq(persons.id, id), eq(persons.orgId, orgId)))
    .returning({ id: persons.id })
  return deleted.length > 0
}
