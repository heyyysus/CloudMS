import { like } from "drizzle-orm"
import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { db } from "../db"
import { users } from "../db/schema"
import { createMembership, createUser } from "../repositories"
import { TestContext } from "../routes/testHelpers"

const testEmailPrefix = "auth-org-test-"

const ctx = new TestContext()

function makeUser(suffix: string) {
  return createUser({ email: `${testEmailPrefix}${suffix}@example.com` })
}

afterEach(async () => {
  await db.delete(users).where(like(users.email, `${testEmailPrefix}%`))
  await ctx.cleanup()
})

describe("POST /auth/org", () => {
  it("binds the session to an org the caller is an active member of", async () => {
    const user = await makeUser("bind")
    const orgA = await ctx.org()
    const orgB = await ctx.org()
    await createMembership({ userId: user.id, orgId: orgA.id, role: "staff" })
    await createMembership({ userId: user.id, orgId: orgB.id, role: "admin" })
    // Signed in with no org bound (two memberships), then picks one.
    const cookie = await ctx.cookie(user.id, orgA.id)

    const res = await request(app).post("/auth/org").set("Cookie", cookie).send({ orgId: orgB.id })

    expect(res.status).toBe(200)
    expect(res.body.org).toMatchObject({ id: orgB.id, name: orgB.name, slug: orgB.slug })
    expect(res.body.user.role).toBe("admin")
    expect(res.body.memberships).toHaveLength(2)

    // The rebind is persisted, not just reflected in the response.
    const me = await request(app).get("/auth/me").set("Cookie", cookie)
    expect(me.body.org.id).toBe(orgB.id)
  })

  it("returns 403 for an org the caller is not an active member of", async () => {
    const user = await makeUser("not-a-member")
    const own = await ctx.org()
    const other = await ctx.org()
    await createMembership({ userId: user.id, orgId: own.id, role: "staff" })
    const cookie = await ctx.cookie(user.id, own.id)

    const res = await request(app).post("/auth/org").set("Cookie", cookie).send({ orgId: other.id })
    expect(res.status).toBe(403)
  })

  it("returns 403 for an org where the membership is inactive", async () => {
    const user = await makeUser("inactive")
    const own = await ctx.org()
    const revoked = await ctx.org()
    await createMembership({ userId: user.id, orgId: own.id, role: "staff" })
    await createMembership({
      userId: user.id,
      orgId: revoked.id,
      role: "staff",
      isActive: false,
    })
    const cookie = await ctx.cookie(user.id, own.id)

    const res = await request(app)
      .post("/auth/org")
      .set("Cookie", cookie)
      .send({ orgId: revoked.id })
    expect(res.status).toBe(403)
  })

  it("returns 400 for a malformed body", async () => {
    const user = await makeUser("badbody")
    const org = await ctx.org()
    await createMembership({ userId: user.id, orgId: org.id, role: "staff" })
    const cookie = await ctx.cookie(user.id, org.id)

    const res = await request(app).post("/auth/org").set("Cookie", cookie).send({ orgId: "nope" })
    expect(res.status).toBe(400)
  })

  it("returns 401 without a cookie", async () => {
    const org = await ctx.org()
    const res = await request(app).post("/auth/org").send({ orgId: org.id })
    expect(res.status).toBe(401)
  })
})
