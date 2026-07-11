import { eq } from "drizzle-orm"
import { db } from "../db"
import { clientPhones } from "../db/schema"
import type { ClientPhone } from "../types"

export async function listPhonesByClientId(clientId: number): Promise<ClientPhone[]> {
  return db.select().from(clientPhones).where(eq(clientPhones.clientId, clientId))
}

export async function addPhoneToClient(
  clientId: number,
  phoneNumber: string
): Promise<ClientPhone> {
  const [row] = await db.insert(clientPhones).values({ clientId, phoneNumber }).returning()
  return row
}

export async function deletePhone(id: number): Promise<boolean> {
  const deleted = await db
    .delete(clientPhones)
    .where(eq(clientPhones.id, id))
    .returning({ id: clientPhones.id })
  return deleted.length > 0
}
