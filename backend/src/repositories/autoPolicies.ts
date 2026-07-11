import { eq } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies } from "../db/schema"
import type { AutoPolicy, NewAutoPolicy } from "../types"

export async function listAutoPolicies(): Promise<AutoPolicy[]> {
  return db.select().from(autoPolicies)
}

export async function findAutoPolicyById(id: number): Promise<AutoPolicy | undefined> {
  const [row] = await db.select().from(autoPolicies).where(eq(autoPolicies.id, id))
  return row
}

export async function getPolicyWithDetails(id: number) {
  return db.query.autoPolicies.findFirst({
    where: eq(autoPolicies.id, id),
    with: {
      client: true,
      carrier: true,
      vehicles: true,
      policyDrivers: { with: { driver: { with: { person: true } } } },
    },
  })
}

export async function createAutoPolicy(input: NewAutoPolicy): Promise<AutoPolicy> {
  const [row] = await db.insert(autoPolicies).values(input).returning()
  return row
}

export async function updateAutoPolicy(
  id: number,
  input: Partial<NewAutoPolicy>
): Promise<AutoPolicy | undefined> {
  const [row] = await db
    .update(autoPolicies)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(autoPolicies.id, id))
    .returning()
  return row
}

export async function deleteAutoPolicy(id: number): Promise<boolean> {
  const deleted = await db
    .delete(autoPolicies)
    .where(eq(autoPolicies.id, id))
    .returning({ id: autoPolicies.id })
  return deleted.length > 0
}
