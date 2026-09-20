import { and, eq, lt } from "drizzle-orm"
import { db } from "../db"
import { sessions, users } from "../db/schema"
import type { NewSession, Session, User } from "../types"

export async function createSession(input: NewSession): Promise<Session> {
  const [row] = await db.insert(sessions).values(input).returning()
  return row
}

export async function findSessionWithUserByTokenHash(
  tokenHash: string
): Promise<{ session: Session; user: User } | undefined> {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
  return row
}

export async function deleteSessionByTokenHash(tokenHash: string): Promise<boolean> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .returning({ id: sessions.id })
  return deleted.length > 0
}

export async function deleteSessionsByUserId(userId: number): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ id: sessions.id })
  return deleted.length
}

// Kills a user's sessions bound to one org, leaving their sessions in other
// orgs (and any org-less session) alive - used when a membership is
// deactivated, as opposed to the platform-level deleteSessionsByUserId.
export async function deleteSessionsByUserIdAndOrg(userId: number, orgId: number): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), eq(sessions.orgId, orgId)))
    .returning({ id: sessions.id })
  return deleted.length
}

export async function setSessionOrg(sessionId: number, orgId: number): Promise<Session | undefined> {
  const [row] = await db
    .update(sessions)
    .set({ orgId })
    .where(eq(sessions.id, sessionId))
    .returning()
  return row
}

export async function deleteExpiredSessions(): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date()))
    .returning({ id: sessions.id })
  return deleted.length
}
