import { and, eq, isNotNull, isNull, ne } from "drizzle-orm"
import { AUTOMATION_USER_EMAIL } from "../jobs/automationUser"
import { db } from "../db"
import { users } from "../db/schema"
import type { NewUser, User } from "../types"

// The automation user is a permanently-disabled system row (see
// jobs/automationUser.ts) that must never appear as something an admin can
// edit or delete, so every listing excludes it alongside soft-deleted rows.
function visibleToAdmin() {
  return and(isNull(users.deletedAt), ne(users.email, AUTOMATION_USER_EMAIL))
}

export async function listUsers(): Promise<User[]> {
  return db.select().from(users).where(visibleToAdmin()).orderBy(users.id)
}

export async function findUserById(id: number): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row
}

// The invite flow needs to see a soft-deleted row (to offer restoring it)
// where every other caller wants the deleted-email slot to look free.
export async function findUserByEmail(
  email: string,
  options?: { includeDeleted?: boolean }
): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(
      options?.includeDeleted
        ? eq(users.email, email)
        : and(eq(users.email, email), isNull(users.deletedAt))
    )
  return row
}

export async function createUser(input: NewUser): Promise<User> {
  const [row] = await db.insert(users).values(input).returning()
  return row
}

export async function updateUser(id: number, input: Partial<NewUser>): Promise<User | undefined> {
  const [row] = await db
    .update(users)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()
  return row
}

// Never a hard delete: users.id is referenced by nine NOT NULL FKs (policy
// logs, attachments, invoices, payments, receipts) with ON DELETE no action,
// so removing the row would either fail or destroy history. Distinct from
// isActive - this is meant to look permanent to an admin, not to be toggled
// back from the same menu.
export async function softDeleteUser(id: number, actorId: number): Promise<User | undefined> {
  const [row] = await db
    .update(users)
    .set({ deletedAt: new Date(), deletedBy: actorId, isActive: false, updatedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .returning()
  return row
}

// Only reachable by re-inviting a deleted user's email; see POST
// /users/invite. Re-activates the account under its original id so existing
// history stays attributed to the same row.
export async function restoreUser(id: number): Promise<User | undefined> {
  const [row] = await db
    .update(users)
    .set({ deletedAt: null, deletedBy: null, isActive: true, updatedAt: new Date() })
    .where(and(eq(users.id, id), isNotNull(users.deletedAt)))
    .returning()
  return row
}
