import { like } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { db } from "../db"
import { users } from "../db/schema"
import {
  createSession,
  createUser,
  findMembership,
  findOrganizationBySlug,
  softDeleteUser,
} from "../repositories"
import { generateSessionToken, hashToken } from "../auth/tokens"
import { TestContext } from "./testHelpers"

const testEmailPrefix = "org-create-test-"

const ctx = new TestContext()

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`.slice(0, 64)
}

function makePlatformOwner(suffix: string) {
  return createUser({
    email: `${testEmailPrefix}${suffix}@example.com`,
    isPlatformOwner: true,
  })
}

// Mirrors the org picker's actual unbound state (auth/platformOwner.test.ts):
// a platform owner acts before any organization exists, so their session
// carries no org.
async function unboundSessionCookie(userId: string): Promise<string> {
  const token = generateSessionToken()
  await createSession({
    userId,
    orgId: null,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return `session=${token}`
}

afterEach(async () => {
  await db.delete(users).where(like(users.email, `${testEmailPrefix}%`))
  await ctx.cleanup()
})

describe("POST /organizations", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app)
      .post("/organizations")
      .send({ name: "Acme", slug: uniqueSlug("acme"), admin: { email: "admin@example.com" } })
    expect(res.status).toBe(401)
  })

  it("returns 403 for a signed-in user who is not a platform owner", async () => {
    const staff = await ctx.user("org-create-staff", "staff")
    const cookie = await ctx.cookie(staff.id)

    const res = await request(app)
      .post("/organizations")
      .set("Cookie", cookie)
      .send({ name: "Acme", slug: uniqueSlug("acme"), admin: { email: "admin@example.com" } })

    expect(res.status).toBe(403)
  })

  it("returns 403 for an org admin of another org - membership admin grants no platform capability", async () => {
    const orgA = await ctx.org()
    const admin = await ctx.user("org-create-admin-a", "admin", orgA.id)
    const cookie = await ctx.cookie(admin.id, orgA.id)
    const slug = uniqueSlug("org-b")

    const res = await request(app)
      .post("/organizations")
      .set("Cookie", cookie)
      .send({ name: "Org B", slug, admin: { email: "new-admin@example.com" } })

    expect(res.status).toBe(403)
    expect(await findOrganizationBySlug(slug)).toBeUndefined()
  })

  it("returns 400 for a bad body", async () => {
    const owner = await makePlatformOwner("badbody")
    const cookie = await unboundSessionCookie(owner.id)

    const res = await request(app)
      .post("/organizations")
      .set("Cookie", cookie)
      .send({ name: "Acme", slug: "Not A Slug!", admin: { email: "admin@example.com" } })

    expect(res.status).toBe(400)
  })

  it("creates the organization and seats the given email as its admin", async () => {
    const owner = await makePlatformOwner("create")
    const cookie = await unboundSessionCookie(owner.id)
    const slug = uniqueSlug("acme")
    const adminEmail = `${testEmailPrefix}seated-${slug}@example.com`

    const res = await request(app)
      .post("/organizations")
      .set("Cookie", cookie)
      .send({ name: "Acme Insurance", slug, admin: { email: adminEmail, name: "New Admin" } })

    expect(res.status).toBe(201)
    expect(res.body.organization).toMatchObject({ name: "Acme Insurance", slug })
    expect(res.body.admin).toMatchObject({ email: adminEmail, name: "New Admin", role: "admin" })
    ctx.track("organization", res.body.organization.id)
    ctx.track("user", res.body.admin.id)

    const membership = await findMembership(res.body.admin.id, res.body.organization.id)
    expect(membership?.role).toBe("admin")
    expect(membership?.isActive).toBe(true)
  })

  it("returns 409 for a duplicate slug and leaves no zero-admin organization behind", async () => {
    const owner = await makePlatformOwner("dupe-slug")
    const cookie = await unboundSessionCookie(owner.id)
    const slug = uniqueSlug("dupe-org")
    const firstAdminEmail = `${testEmailPrefix}dupe-first-${slug}@example.com`
    const secondAdminEmail = `${testEmailPrefix}dupe-second-${slug}@example.com`

    const first = await request(app)
      .post("/organizations")
      .set("Cookie", cookie)
      .send({ name: "First", slug, admin: { email: firstAdminEmail } })
    expect(first.status).toBe(201)
    ctx.track("organization", first.body.organization.id)
    ctx.track("user", first.body.admin.id)

    const second = await request(app)
      .post("/organizations")
      .set("Cookie", cookie)
      .send({ name: "Second", slug, admin: { email: secondAdminEmail } })

    expect(second.status).toBe(409)
    const secondAdminRows = await db.select().from(users).where(like(users.email, secondAdminEmail))
    expect(secondAdminRows).toHaveLength(0)
  })

  it("rolls back the organization when the admin email belongs to a deleted user", async () => {
    const owner = await makePlatformOwner("rollback")
    const cookie = await unboundSessionCookie(owner.id)
    const deletedUser = await makePlatformOwner("rollback-deleted")
    await softDeleteUser(deletedUser.id, owner.id)
    const slug = uniqueSlug("rollback-org")

    const res = await request(app)
      .post("/organizations")
      .set("Cookie", cookie)
      .send({ name: "Rollback Org", slug, admin: { email: deletedUser.email } })

    expect(res.status).toBe(409)
    expect(res.body.deletedUserId).toBe(deletedUser.id)
    expect(await findOrganizationBySlug(slug)).toBeUndefined()
  })
})
