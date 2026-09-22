import { eq, sql } from "drizzle-orm"
import { db } from "../db"
import { organizations } from "../db/schema"
import type { NewOrganization, Organization } from "../types"
import { CrossOrgReferenceError } from "./errors"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export async function findOrganizationById(id: string): Promise<Organization | undefined> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id))
  return row
}

export async function findOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug))
  return row
}

// Platform-owner only (see GET /organizations) - every organization on the
// deployment, not scoped to any one of them. `organizations` is exempt from
// RLS (see rls.ts's AUTH_LAYER_TABLES), so plain `db` already sees every row.
export async function listOrganizations(): Promise<Organization[]> {
  return db.select().from(organizations).orderBy(organizations.name)
}

export async function createOrganization(values: NewOrganization): Promise<Organization> {
  const [row] = await db.insert(organizations).values(values).returning()
  return row
}

// Allocates the next invoice/receipt number for an organization, on the
// caller's transaction so a rollback (e.g. a later validation failure in the
// same create) does not burn the number. RETURNING sees the post-UPDATE
// value, so subtracting 1 yields the number just allocated. The UPDATE takes
// a row lock on the organization for the rest of the transaction, which
// serializes concurrent invoice/receipt creates within one org - call this as
// late in the transaction as correctness allows.
export async function allocateInvoiceNumberInTx(tx: Tx, orgId: string): Promise<number> {
  const [row] = await tx
    .update(organizations)
    .set({ nextInvoiceNumber: sql`${organizations.nextInvoiceNumber} + 1` })
    .where(eq(organizations.id, orgId))
    .returning({ number: sql<number>`${organizations.nextInvoiceNumber} - 1` })
  if (!row) throw new CrossOrgReferenceError()
  return Number(row.number)
}

export async function allocateReceiptNumberInTx(tx: Tx, orgId: string): Promise<number> {
  const [row] = await tx
    .update(organizations)
    .set({ nextReceiptNumber: sql`${organizations.nextReceiptNumber} + 1` })
    .where(eq(organizations.id, orgId))
    .returning({ number: sql<number>`${organizations.nextReceiptNumber} - 1` })
  if (!row) throw new CrossOrgReferenceError()
  return Number(row.number)
}
