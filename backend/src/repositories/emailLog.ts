import { desc } from "drizzle-orm"
import { db } from "../db"
import { emailLog } from "../db/schema"
import type { EmailLogEntry, NewEmailLogEntry } from "../types"

export async function createEmailLogEntry(input: NewEmailLogEntry): Promise<EmailLogEntry> {
  const [row] = await db.insert(emailLog).values(input).returning()
  return row
}

export async function listEmailLogEntries(limit = 50): Promise<EmailLogEntry[]> {
  return db.select().from(emailLog).orderBy(desc(emailLog.sentAt)).limit(limit)
}
