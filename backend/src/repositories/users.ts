import { eq } from "drizzle-orm"
import { db } from "../db"
import { users } from "../db/schema"
import type { NewUser, User } from "../types"

export async function listUsers(): Promise<User[]> {
  return db.select().from(users)
}

export async function findUserById(id: number): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, id))
  return row
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email))
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

export async function deleteUser(id: number): Promise<boolean> {
  const deleted = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id })
  return deleted.length > 0
}
