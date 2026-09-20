import { and, eq, isNull, ne } from "drizzle-orm"
import { AUTOMATION_USER_EMAIL } from "../jobs/automationUser"
import { db } from "../db"
import { organizations, orgMemberships, users } from "../db/schema"
import type { NewOrgMembership, OrgMembership, User } from "../types"

export async function listMembershipsForUser(userId: string): Promise<OrgMembership[]> {
  return db
    .select()
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId))
    .orderBy(orgMemberships.orgId)
}

export async function findMembership(
  userId: string,
  orgId: string
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
  id: string,
  input: Partial<NewOrgMembership>
): Promise<OrgMembership | undefined> {
  const [row] = await db
    .update(orgMemberships)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(orgMemberships.id, id))
    .returning()
  return row
}

export async function deactivateMembership(id: string): Promise<OrgMembership | undefined> {
  return updateMembership(id, { isActive: false })
}

export async function findActiveMembership(
  userId: string,
  orgId: string
): Promise<OrgMembership | undefined> {
  const [row] = await db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.userId, userId),
        eq(orgMemberships.orgId, orgId),
        eq(orgMemberships.isActive, true)
      )
    )
  return row
}

export interface ActiveMembershipWithOrg {
  orgId: string
  name: string
  slug: string
  role: OrgMembership["role"]
}

// Every active org a user belongs to, with the org's display fields - both
// the /auth/me `memberships` array and the /auth/google auto-bind input.
export async function listActiveMembershipsWithOrg(
  userId: string
): Promise<ActiveMembershipWithOrg[]> {
  return db
    .select({
      orgId: orgMemberships.orgId,
      name: organizations.name,
      slug: organizations.slug,
      role: orgMemberships.role,
    })
    .from(orgMemberships)
    .innerJoin(organizations, eq(orgMemberships.orgId, organizations.id))
    .where(and(eq(orgMemberships.userId, userId), eq(orgMemberships.isActive, true)))
    .orderBy(organizations.name)
}

export interface OrgMember {
  user: User
  role: OrgMembership["role"]
  isActive: boolean
}

// The active org's roster: every non-deleted, non-automation user with a
// membership in orgId, alongside that membership's role/isActive. Lifted out
// of repositories/users.ts's old visibleToAdmin() predicate, which this
// replaces - GET /users is now membership-scoped rather than global.
export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const rows = await db
    .select({ user: users, role: orgMemberships.role, isActive: orgMemberships.isActive })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(
      and(
        eq(orgMemberships.orgId, orgId),
        isNull(users.deletedAt),
        ne(users.email, AUTOMATION_USER_EMAIL)
      )
    )
    .orderBy(users.email)
  return rows
}
