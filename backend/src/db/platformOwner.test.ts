import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { adminDb } from "./index"
import { ensurePlatformOwner } from "./platformOwner"
import { users } from "./schema"
import { createMembership, createUser, listActiveMembershipsWithOrg } from "../repositories"
import { TestContext } from "../routes/testHelpers"

const testEmail = `platform-owner-db-test-${Date.now()}@example.com`

const ctx = new TestContext()

afterEach(async () => {
  delete process.env.PLATFORM_OWNER_EMAIL
  await adminDb.delete(users).where(eq(users.email, testEmail))
  await ctx.cleanup()
})

describe("ensurePlatformOwner", () => {
  it("two consecutive calls leave exactly one user row with the flag set", async () => {
    process.env.PLATFORM_OWNER_EMAIL = testEmail

    await ensurePlatformOwner()
    await ensurePlatformOwner()

    const rows = await adminDb.select().from(users).where(eq(users.email, testEmail))
    expect(rows).toHaveLength(1)
    expect(rows[0].isPlatformOwner).toBe(true)
  })

  it("is a no-op when the env var is unset", async () => {
    delete process.env.PLATFORM_OWNER_EMAIL

    await expect(ensurePlatformOwner()).resolves.toBeUndefined()

    const rows = await adminDb.select().from(users).where(eq(users.email, testEmail))
    expect(rows).toHaveLength(0)
  })

  it("promotes an address that already has a user row in place, leaving its memberships untouched", async () => {
    const existing = await createUser({ email: testEmail })
    const org = await ctx.org()
    await createMembership({ userId: existing.id, orgId: org.id, role: "staff" })
    // Mixed case, like a human typing the env var - the lookup must still
    // land on the lowercase row bootstrap.ts's convention creates.
    process.env.PLATFORM_OWNER_EMAIL = testEmail.toUpperCase()

    await ensurePlatformOwner()

    const rows = await adminDb.select().from(users).where(eq(users.email, testEmail))
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(existing.id)
    expect(rows[0].isPlatformOwner).toBe(true)

    const memberships = await listActiveMembershipsWithOrg(existing.id)
    expect(memberships).toHaveLength(1)
    expect(memberships[0]).toMatchObject({ orgId: org.id, role: "staff" })
  })
})
