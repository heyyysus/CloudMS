import { eq } from "drizzle-orm"
import { db } from "../db"
import { persons } from "../db/schema"
import type { NewPerson, Person } from "../types"

export async function listPersons(): Promise<Person[]> {
  return db.select().from(persons)
}

export async function findPersonById(id: number): Promise<Person | undefined> {
  const [row] = await db.select().from(persons).where(eq(persons.id, id))
  return row
}

export async function createPerson(input: NewPerson): Promise<Person> {
  const [row] = await db.insert(persons).values(input).returning()
  return row
}

export async function updatePerson(
  id: number,
  input: Partial<NewPerson>
): Promise<Person | undefined> {
  const [row] = await db
    .update(persons)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(persons.id, id))
    .returning()
  return row
}

export async function deletePerson(id: number): Promise<boolean> {
  const deleted = await db.delete(persons).where(eq(persons.id, id)).returning({ id: persons.id })
  return deleted.length > 0
}
