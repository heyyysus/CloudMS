import { like } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { db } from "../db"
import { organizations, users } from "../db/schema"
import {
  createMembership,
  createUser,
  findMembership,
  listMembershipsForUser,
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
  return createUser({ email: `${testPrefix}${suffix}@example.com`, role: "staff" })
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
})
