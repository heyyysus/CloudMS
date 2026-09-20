import { eq } from "drizzle-orm"
import type { User } from "../../types"
import { adminDb as db } from "../index"
import { orgMemberships, users } from "../schema"
import { faker } from "./rng"

interface SeedUsersOptions {
  staffCount: number
  // How many of the staffCount random users get role "admin" (the rest get
  // "staff"). Only the first org's seeding gives the agency more than one
  // admin; the second org is "a couple of policies, two staff" per the issue.
  adminAmongStaff?: number
  // Whether ADMIN_EMAIL gets a membership in this org. Its users row is only
  // created once, on the first org that passes true - a later call reuses
  // the existing row rather than re-inserting the email.
  includeAdmin: boolean
}

// Inserts staffCount random users plus (optionally) ADMIN_EMAIL, and an
// org_memberships row per user scoped to orgId mirroring users.role - see
// docs/multitenancy.md's "no org_id on users" divergence for why the users
// row itself carries no org_id. usedEmails is shared across every call so
// two orgs' random staff (and ADMIN_EMAIL) can't collide on users.email,
// which stays globally unique.
export async function seedUsers(
  orgId: number,
  usedEmails: Set<string>,
  { staffCount, adminAmongStaff = 0, includeAdmin }: SeedUsersOptions
): Promise<User[]> {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
  const adminNeedsUserRow = includeAdmin && !!adminEmail && !usedEmails.has(adminEmail)
  if (adminEmail) usedEmails.add(adminEmail)

  const staff = Array.from({ length: staffCount }, (_, i) => {
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    let email = faker.internet.email({ firstName, lastName }).toLowerCase()
    while (usedEmails.has(email)) {
      email = faker.internet
        .email({ firstName, lastName, provider: `agency${orgId}-${i}.example.com` })
        .toLowerCase()
    }
    usedEmails.add(email)
    return {
      email,
      name: `${firstName} ${lastName}`,
      role: i < adminAmongStaff ? ("admin" as const) : ("staff" as const),
    }
  })

  const values = adminNeedsUserRow
    ? [{ email: adminEmail!, name: "Admin", role: "admin" as const }, ...staff]
    : staff
  // Built alongside `values` (rather than read back off the inserted rows,
  // which no longer carry a role) so the membership insert below can zip
  // each inserted user back up with the role it was meant to get.
  const roles = values.map((v) => v.role)

  const inserted =
    values.length > 0
      ? await db
          .insert(users)
          .values(
            values.map((v) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { role, ...rest } = v
              return rest
            })
          )
          .returning()
      : []

  let orgUsers = inserted
  let orgUserRoles = roles
  if (includeAdmin && adminEmail && !adminNeedsUserRow) {
    const [existingAdmin] = await db.select().from(users).where(eq(users.email, adminEmail))
    orgUsers = [existingAdmin, ...inserted]
    orgUserRoles = ["admin", ...roles]
  }

  if (orgUsers.length > 0) {
    await db.insert(orgMemberships).values(
      orgUsers.map((u, i) => ({
        userId: u.id,
        orgId,
        role: orgUserRoles[i],
      }))
    )
  }

  return orgUsers
}
