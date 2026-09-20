import { like } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { db } from "../db"
import { organizations, users } from "../db/schema"
import {
  createMembership,
  createUser,
  deactivateMembership,
  findActiveMembership,
  findMembership,
  listActiveMembershipsWithOrg,
  listMembershipsForUser,
  listOrgMembers,
  updateMembership,
} from "./index"

const testPrefix = "org-memberships-repo-test-"

function makeOrg(suffix: string) {
  return db
    .insert(organizations)
    .values({ name: `Org Memberships Repo Test ${suffix}`, slug: `${testPrefix}${suffix}` })
    .returning()
    .then(([row]) => row)
}

function makeUser(suffix: string) {
  return createUser({ email: `${testPrefix}${suffix}@example.com` })
}

afterEach(async () => {
  // Deleting the org cascades its memberships; deleting the user does too.
  await db.delete(users).where(like(users.email, `${testPrefix}%`))
  await db.delete(organizations).where(like(organizations.slug, `${testPrefix}%`))
})

describe("orgMemberships repository", () => {
  it("creates a membership and finds it by user and org", async () => {
    const org = await makeOrg("find")
    const user = await makeUser("find")

    const created = await createMembership({ userId: user.id, orgId: org.id, role: "staff" })
    expect(created.isActive).toBe(true)

    const found = await findMembership(user.id, org.id)
    expect(found?.id).toBe(created.id)
  })

  it("returns undefined for a non-membership", async () => {
    const org = await makeOrg("miss")
    const user = await makeUser("miss")

    expect(await findMembership(user.id, org.id)).toBeUndefined()
  })

  it("lists both of a user's orgs and excludes another user's membership", async () => {
    const orgA = await makeOrg("list-a")
    const orgB = await makeOrg("list-b")
    const user = await makeUser("list")
    const otherUser = await makeUser("list-other")

    await createMembership({ userId: user.id, orgId: orgA.id, role: "staff" })
    await createMembership({ userId: user.id, orgId: orgB.id, role: "admin" })
    await createMembership({ userId: otherUser.id, orgId: orgA.id, role: "staff" })

    const memberships = await listMembershipsForUser(user.id)
    expect(memberships.map((m) => m.orgId).sort()).toEqual([orgA.id, orgB.id].sort())
  })

  it("updates a membership's role and isActive, bumping updatedAt", async () => {
    const org = await makeOrg("update")
    const user = await makeUser("update")
    const created = await createMembership({ userId: user.id, orgId: org.id, role: "staff" })

    const updated = await updateMembership(created.id, { role: "admin", isActive: false })
    expect(updated?.role).toBe("admin")
    expect(updated?.isActive).toBe(false)
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
  })

  it("rejects a duplicate (userId, orgId) membership", async () => {
    const org = await makeOrg("dup")
    const user = await makeUser("dup")
    await createMembership({ userId: user.id, orgId: org.id, role: "staff" })

    await expect(
      createMembership({ userId: user.id, orgId: org.id, role: "admin" })
    ).rejects.toThrow()
  })

  it("deactivateMembership flips isActive to false", async () => {
    const org = await makeOrg("deactivate")
    const user = await makeUser("deactivate")
    const created = await createMembership({ userId: user.id, orgId: org.id, role: "staff" })

    const deactivated = await deactivateMembership(created.id)
    expect(deactivated?.isActive).toBe(false)
  })

  it("findActiveMembership excludes an inactive membership", async () => {
    const org = await makeOrg("find-active")
    const user = await makeUser("find-active")
    const created = await createMembership({ userId: user.id, orgId: org.id, role: "staff" })

    expect((await findActiveMembership(user.id, org.id))?.id).toBe(created.id)

    await deactivateMembership(created.id)
    expect(await findActiveMembership(user.id, org.id)).toBeUndefined()
  })

  it("listActiveMembershipsWithOrg lists only active orgs, with their org fields", async () => {
    const orgA = await makeOrg("active-a")
    const orgB = await makeOrg("active-b")
    const user = await makeUser("active-list")
    await createMembership({ userId: user.id, orgId: orgA.id, role: "admin" })
    const inactive = await createMembership({ userId: user.id, orgId: orgB.id, role: "staff" })
    await deactivateMembership(inactive.id)

    const memberships = await listActiveMembershipsWithOrg(user.id)
    expect(memberships).toEqual([{ orgId: orgA.id, name: orgA.name, slug: orgA.slug, role: "admin" }])
  })

  it("listOrgMembers returns an org's members and excludes another org's", async () => {
    const orgA = await makeOrg("members-a")
    const orgB = await makeOrg("members-b")
    const memberA = await makeUser("members-a-user")
    const memberB = await makeUser("members-b-user")
    await createMembership({ userId: memberA.id, orgId: orgA.id, role: "admin" })
    await createMembership({ userId: memberB.id, orgId: orgB.id, role: "staff" })

    const members = await listOrgMembers(orgA.id)
    expect(members.map((m) => m.user.id)).toEqual([memberA.id])
    expect(members[0].role).toBe("admin")
    expect(members[0].isActive).toBe(true)
  })
})
