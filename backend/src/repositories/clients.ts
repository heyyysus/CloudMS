import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, clientEmails, clientPhones, clients, persons } from "../db/schema"
import type { Client, NewClient } from "../types"
import { CrossOrgReferenceError } from "./errors"

export async function listClients(orgId: string): Promise<Client[]> {
  return db.select().from(clients).where(eq(clients.orgId, orgId))
}

export async function findClientById(orgId: string, id: string): Promise<Client | undefined> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
  return row
}

export async function getClientWithDetails(orgId: string, id: string) {
  return db.query.clients.findFirst({
    where: and(eq(clients.id, id), eq(clients.orgId, orgId)),
    with: {
      namedInsured: true,
      secondNamedInsured: true,
      phones: { where: eq(clientPhones.orgId, orgId) },
      emails: { where: eq(clientEmails.orgId, orgId) },
      policies: { where: eq(autoPolicies.orgId, orgId) },
    },
  })
}

async function checkPersonParents(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orgId: string,
  personIds: (string | null | undefined)[]
) {
  for (const personId of personIds) {
    if (personId === null || personId === undefined) continue
    const [person] = await tx
      .select()
      .from(persons)
      .where(and(eq(persons.id, personId), eq(persons.orgId, orgId)))
    if (!person) throw new CrossOrgReferenceError()
  }
}

export async function createClient(
  orgId: string,
  input: Omit<NewClient, "orgId">
): Promise<Client> {
  return db.transaction(async (tx) => {
    await checkPersonParents(tx, orgId, [input.namedInsuredId, input.secondNamedInsuredId])

    const [row] = await tx
      .insert(clients)
      .values({ ...input, orgId })
      .returning()
    return row
  })
}

export async function updateClient(
  orgId: string,
  id: string,
  input: Partial<Omit<NewClient, "orgId">>
): Promise<Client | undefined> {
  return db.transaction(async (tx) => {
    await checkPersonParents(tx, orgId, [input.namedInsuredId, input.secondNamedInsuredId])

    const [row] = await tx
      .update(clients)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
      .returning()
    return row
  })
}

export async function deleteClient(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(clients)
    .where(and(eq(clients.id, id), eq(clients.orgId, orgId)))
    .returning({ id: clients.id })
  return deleted.length > 0
}
