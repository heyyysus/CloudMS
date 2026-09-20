import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { orgMemberships } from "../db/schema"
import type { NewOrgMembership, OrgMembership } from "../types"

export async function listMembershipsForUser(userId: number): Promise<OrgMembership[]> {
  return db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId))
    .orderBy(orgMemberships.orgId)
}

export async function findMembership(
  userId: number,
  orgId: number
): Promise<OrgMembership | undefined> {
  const [row] = await db
    .select()
    .from(orgMemberships)
    .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.orgId, orgId)))
  return row
}

export async function createMembership(input: NewOrgMembership): Promise<OrgMembership> {
  const [row] = await db.insert(orgMemberships).values(input).returning()
  return row
}

export async function updateMembership(
  id: number,
  input: Partial<NewOrgMembership>
): Promise<OrgMembership | undefined> {
  const [row] = await db
    .update(orgMemberships)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(orgMemberships.id, id))
    .returning()
  return row
}
