import { eq } from "drizzle-orm"
import { db } from "../db"
import { clientEmails } from "../db/schema"
import type { ClientEmail } from "../types"

export async function listEmailsByClientId(clientId: number): Promise<ClientEmail[]> {
  return db.select().from(clientEmails).where(eq(clientEmails.clientId, clientId))
}

export async function addEmailToClient(clientId: number, email: string): Promise<ClientEmail> {
  const [row] = await db.insert(clientEmails).values({ clientId, email }).returning()
  return row
}

export async function deleteEmail(id: number): Promise<boolean> {
  const deleted = await db
    .delete(clientEmails)
    .where(eq(clientEmails.id, id))
    .returning({ id: clientEmails.id })
  return deleted.length > 0
}

export async function replaceClientEmails(
  clientId: number,
  emails: string[]
): Promise<ClientEmail[]> {
  return db.transaction(async (tx) => {
    await tx.delete(clientEmails).where(eq(clientEmails.clientId, clientId))
    if (emails.length === 0) return []
    return tx.insert(clientEmails).values(emails.map((email) => ({ clientId, email }))).returning()
  })
}
