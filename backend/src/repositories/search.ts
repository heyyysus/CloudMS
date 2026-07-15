import { alias } from "drizzle-orm/pg-core"
import { AnyColumn, eq, ilike, inArray, or, sql } from "drizzle-orm"
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

// Must stay structurally identical to the matching *_addr_trgm_idx expression
// index in schema.ts so Postgres can use the index for these ILIKE queries.
function addressConcat(cols: {
  address1: AnyColumn
  address2: AnyColumn
  city: AnyColumn
  state: AnyColumn
  zip: AnyColumn
}) {
  return sql`(coalesce(${cols.address1}, '') || ' ' || coalesce(${cols.address2}, '') || ' ' || coalesce(${cols.city}, '') || ' ' || coalesce(${cols.state}, '') || ' ' || coalesce(${cols.zip}, ''))`
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
        sql`${addressConcat({
          address1: clients.mailingAddress1,
          address2: clients.mailingAddress2,
          city: clients.mailingCity,
          state: clients.mailingState,
          zip: clients.mailingZip,
        })} ILIKE ${pattern}`,
        sql`${addressConcat({
          address1: clients.physicalAddress1,
          address2: clients.physicalAddress2,
          city: clients.physicalCity,
          state: clients.physicalState,
          zip: clients.physicalZip,
        })} ILIKE ${pattern}`,
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
      or(
        ilike(autoPolicies.policyNumber, pattern),
        sql`${addressConcat({
          address1: autoPolicies.policyAddress1,
          address2: autoPolicies.policyAddress2,
          city: autoPolicies.policyCity,
          state: autoPolicies.policyState,
          zip: autoPolicies.policyZip,
        })} ILIKE ${pattern}`
      )
    )
    .limit(limit)
}
