import { eq } from "drizzle-orm"
import { db } from "../db"
import { organizations } from "../db/schema"
import type { Organization } from "../types"

export async function findOrganizationById(id: number): Promise<Organization | undefined> {
  const [row] = await db.select().from(organizations).where(eq(organizations.id, id))
  return row
}

export async function findOrganizationBySlug(slug: string): Promise<Organization | undefined> {
  const [row] = await db.select().from(organizations).where(eq(organizations.slug, slug))
  return row
}
