import { like } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { hashToken } from "../auth/tokens"
import { db } from "../db"
import { users } from "../db/schema"
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  deleteSessionsByUserId,
  findSessionWithUserByTokenHash,
} from "./index"

const testEmailPrefix = "sessions-repo-test-"

function makeUser(suffix: string) {
  return createUser({ email: `${testEmailPrefix}${suffix}@example.com`, role: "staff" })
}

function futureDate() {
  return new Date(Date.now() + 60 * 60 * 1000)
}

afterEach(async () => {
  // Deleting the user cascades to its sessions.
  await db.delete(users).where(like(users.email, `${testEmailPrefix}%`))
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
})
