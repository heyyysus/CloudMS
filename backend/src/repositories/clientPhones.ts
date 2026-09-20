import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { clientPhones, clients } from "../db/schema"
import type { ClientPhone } from "../types"
import { CrossOrgReferenceError } from "./errors"

export async function listPhonesByClientId(
  orgId: string,
  clientId: string
): Promise<ClientPhone[]> {
  return db
    .select()
    .from(clientPhones)
    .where(and(eq(clientPhones.clientId, clientId), eq(clientPhones.orgId, orgId)))
}

export async function addPhoneToClient(
  orgId: string,
  clientId: string,
  phoneNumber: string
): Promise<ClientPhone> {
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    if (!client) throw new CrossOrgReferenceError()

    const [row] = await tx.insert(clientPhones).values({ clientId, phoneNumber, orgId }).returning()
    return row
  })
}

export async function deletePhone(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(clientPhones)
    .where(and(eq(clientPhones.id, id), eq(clientPhones.orgId, orgId)))
    .returning({ id: clientPhones.id })
  return deleted.length > 0
}

export async function replaceClientPhones(
  orgId: string,
  clientId: string,
  phoneNumbers: string[]
): Promise<ClientPhone[]> {
  return db.transaction(async (tx) => {
    const [client] = await tx
      .select()
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    if (!client) throw new CrossOrgReferenceError()

    await tx
      .delete(clientPhones)
      .where(and(eq(clientPhones.clientId, clientId), eq(clientPhones.orgId, orgId)))
    if (phoneNumbers.length === 0) return []
    return tx
      .insert(clientPhones)
      .values(phoneNumbers.map((phoneNumber) => ({ clientId, phoneNumber, orgId })))
      .returning()
  })
}
