import { alias } from "drizzle-orm/pg-core"
import { eq, ilike, inArray, or, sql } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, clientEmails, clientPhones, clients, persons } from "../db/schema"

// Escapes ILIKE wildcards so a literal "%" or "_" in a search term is
// matched literally instead of acting as a wildcard.
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&")
}

function likePattern(q: string): string {
  return `%${escapeLikePattern(q)}%`
}

export async function searchClients(q: string, limit = 10) {
  const pattern = likePattern(q)
  const secondInsured = alias(persons, "second_insured")

  const matches = await db
    .selectDistinct({ id: clients.id })
    .from(clients)
    .innerJoin(persons, eq(clients.namedInsuredId, persons.id))
    .leftJoin(secondInsured, eq(clients.secondNamedInsuredId, secondInsured.id))
    .leftJoin(clientPhones, eq(clientPhones.clientId, clients.id))
    .leftJoin(clientEmails, eq(clientEmails.clientId, clients.id))
    .where(
      or(
        ilike(persons.firstName, pattern),
        ilike(persons.lastName, pattern),
        sql`(${persons.firstName} || ' ' || ${persons.lastName}) ILIKE ${pattern}`,
        ilike(secondInsured.firstName, pattern),
        ilike(secondInsured.lastName, pattern),
        sql`(${secondInsured.firstName} || ' ' || ${secondInsured.lastName}) ILIKE ${pattern}`,
        ilike(clients.mailingAddress, pattern),
        ilike(clients.physicalAddress, pattern),
        ilike(clientPhones.phoneNumber, pattern),
        ilike(clientEmails.email, pattern)
      )
    )
    .limit(limit)

  if (matches.length === 0) return []

  const ids = matches.map((m) => m.id)
  const rows = await db.query.clients.findMany({
    where: inArray(clients.id, ids),
    with: { namedInsured: true, secondNamedInsured: true, phones: true, emails: true },
  })

  // Preserve the match/limit order rather than whatever findMany returns.
  const byId = new Map(rows.map((r) => [r.id, r]))
  return ids.map((id) => byId.get(id)).filter((r) => r !== undefined)
}

export async function searchPolicies(q: string, limit = 10) {
  const pattern = likePattern(q)

  return db
    .select({
      id: autoPolicies.id,
      policyNumber: autoPolicies.policyNumber,
      status: autoPolicies.status,
      effectiveDate: autoPolicies.effectiveDate,
      expirationDate: autoPolicies.expirationDate,
      clientId: autoPolicies.clientId,
      clientName: sql<string>`${persons.firstName} || ' ' || ${persons.lastName}`,
    })
    .from(autoPolicies)
    .innerJoin(clients, eq(autoPolicies.clientId, clients.id))
    .innerJoin(persons, eq(clients.namedInsuredId, persons.id))
    .where(
      or(ilike(autoPolicies.policyNumber, pattern), ilike(autoPolicies.policyAddress, pattern))
    )
    .limit(limit)
}
