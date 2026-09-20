import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { clientEmails, clients } from "../db/schema"
import type { ClientEmail } from "../types"
import { CrossOrgReferenceError } from "./errors"

export async function listEmailsByClientId(
  orgId: string,
  clientId: string
): Promise<ClientEmail[]> {
  return db
    .select()
    .from(clientEmails)
    .where(and(eq(clientEmails.clientId, clientId), eq(clientEmails.orgId, orgId)))
}

export async function addEmailToClient(
  orgId: string,
  clientId: string,
  email: string
): Promise<ClientEmail> {
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    if (!client) throw new CrossOrgReferenceError()

    const [row] = await tx.insert(clientEmails).values({ clientId, email, orgId }).returning()
    return row
  })
}

export async function deleteEmail(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(clientEmails)
    .where(and(eq(clientEmails.id, id), eq(clientEmails.orgId, orgId)))
    .returning({ id: clientEmails.id })
  return deleted.length > 0
}

export async function replaceClientEmails(
  orgId: string,
  clientId: string,
  emails: string[]
): Promise<ClientEmail[]> {
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    if (!client) throw new CrossOrgReferenceError()

    await tx
      .delete(clientEmails)
      .where(and(eq(clientEmails.clientId, clientId), eq(clientEmails.orgId, orgId)))
    if (emails.length === 0) return []
    return tx
      .insert(clientEmails)
      .values(emails.map((email) => ({ clientId, email, orgId })))
      .returning()
  })
}
