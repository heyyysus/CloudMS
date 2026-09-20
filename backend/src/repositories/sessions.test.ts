import { like } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { hashToken } from "../auth/tokens"
import { db } from "../db"
import { organizations, users } from "../db/schema"
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  deleteSessionsByUserId,
  deleteSessionsByUserIdAndOrg,
  findSessionWithUserByTokenHash,
  setSessionOrg,
} from "./index"

const testEmailPrefix = "sessions-repo-test-"

function makeUser(suffix: string) {
  return createUser({ email: `${testEmailPrefix}${suffix}@example.com` })
}

function makeOrg(suffix: string) {
  return db
    .insert(organizations)
    .values({ name: `Sessions Repo Test ${suffix}`, slug: `${testEmailPrefix}${suffix}` })
    .returning()
    .then(([row]) => row)
}

function futureDate() {
  return new Date(Date.now() + 60 * 60 * 1000)
}

afterEach(async () => {
  // Deleting the user cascades to its sessions.
  await db.delete(users).where(like(users.email, `${testEmailPrefix}%`))
  await db.delete(organizations).where(like(organizations.slug, `${testEmailPrefix}%`))
})

describe("sessions repository", () => {
  it("creates a session and finds it with its user by token hash", async () => {
    const user = await makeUser("find")
    const tokenHash = hashToken("find-token")
    await createSession({ userId: user.id, tokenHash, expiresAt: futureDate() })

    const row = await findSessionWithUserByTokenHash(tokenHash)
    expect(row?.user.id).toBe(user.id)
    expect(row?.session.tokenHash).toBe(tokenHash)
  })

  it("returns undefined for an unknown token hash", async () => {
    expect(await findSessionWithUserByTokenHash(hashToken("nope"))).toBeUndefined()
  })

  it("deletes a session by token hash", async () => {
    const user = await makeUser("delete")
    const tokenHash = hashToken("delete-token")
    await createSession({ userId: user.id, tokenHash, expiresAt: futureDate() })

    expect(await deleteSessionByTokenHash(tokenHash)).toBe(true)
    expect(await findSessionWithUserByTokenHash(tokenHash)).toBeUndefined()
    expect(await deleteSessionByTokenHash(tokenHash)).toBe(false)
  })

  it("deletes all sessions for a user", async () => {
    const user = await makeUser("revoke")
    await createSession({ userId: user.id, tokenHash: hashToken("r1"), expiresAt: futureDate() })
    await createSession({ userId: user.id, tokenHash: hashToken("r2"), expiresAt: futureDate() })

    expect(await deleteSessionsByUserId(user.id)).toBe(2)
    expect(await findSessionWithUserByTokenHash(hashToken("r1"))).toBeUndefined()
  })

  it("deletes only expired sessions", async () => {
    const user = await makeUser("expired")
    const expiredHash = hashToken("expired-token")
    const liveHash = hashToken("live-token")
    await createSession({
      userId: user.id,
      tokenHash: expiredHash,
      expiresAt: new Date(Date.now() - 1000),
    })
    await createSession({ userId: user.id, tokenHash: liveHash, expiresAt: futureDate() })

    const deleted = await deleteExpiredSessions()
    expect(deleted).toBeGreaterThanOrEqual(1)
    expect(await findSessionWithUserByTokenHash(expiredHash)).toBeUndefined()
    expect(await findSessionWithUserByTokenHash(liveHash)).toBeDefined()
  })

  it("binds a session to an org", async () => {
    const user = await makeUser("set-org")
    const org = await makeOrg("set-org")
    const tokenHash = hashToken("set-org-token")
    const session = await createSession({ userId: user.id, tokenHash, expiresAt: futureDate() })
    expect(session.orgId).toBeNull()

    const updated = await setSessionOrg(session.id, org.id)
    expect(updated?.orgId).toBe(org.id)
  })

  it("deletes only a user's sessions bound to the given org", async () => {
    const user = await makeUser("delete-by-org")
    const orgA = await makeOrg("delete-by-org-a")
    const orgB = await makeOrg("delete-by-org-b")
    const hashA = hashToken("delete-by-org-a-token")
    const hashB = hashToken("delete-by-org-b-token")
    await createSession({
      userId: user.id,
      orgId: orgA.id,
      tokenHash: hashA,
      expiresAt: futureDate(),
    })
    await createSession({
      userId: user.id,
      orgId: orgB.id,
      tokenHash: hashB,
      expiresAt: futureDate(),
    })

    expect(await deleteSessionsByUserIdAndOrg(user.id, orgA.id)).toBe(1)
    expect(await findSessionWithUserByTokenHash(hashA)).toBeUndefined()
    expect(await findSessionWithUserByTokenHash(hashB)).toBeDefined()
  })
})
