import { eq } from "drizzle-orm"
import { db } from "../db"
import { clients } from "../db/schema"
import type { Client, NewClient } from "../types"

export async function listClients(): Promise<Client[]> {
  return db.select().from(clients)
}

export async function findClientById(id: number): Promise<Client | undefined> {
  const [row] = await db.select().from(clients).where(eq(clients.id, id))
  return row
}

export async function getClientWithDetails(id: number) {
  return db.query.clients.findFirst({
    where: eq(clients.id, id),
    with: {
      namedInsured: true,
      secondNamedInsured: true,
      phones: true,
      emails: true,
      policies: true,
    },
  })
}

export async function createClient(input: NewClient): Promise<Client> {
  const [row] = await db.insert(clients).values(input).returning()
  return row
}

export async function updateClient(
  id: number,
  input: Partial<NewClient>
): Promise<Client | undefined> {
  const [row] = await db
    .update(clients)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(clients.id, id))
    .returning()
  return row
}

export async function deleteClient(id: number): Promise<boolean> {
  const deleted = await db.delete(clients).where(eq(clients.id, id)).returning({ id: clients.id })
  return deleted.length > 0
}
