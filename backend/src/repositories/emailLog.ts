import { desc, eq } from "drizzle-orm"
import { db } from "../db"
import { emailLog } from "../db/schema"
import type { EmailLogEntry, NewEmailLogEntry } from "../types"

export async function createEmailLogEntry(
  orgId: string,
  input: Omit<NewEmailLogEntry, "orgId">
): Promise<EmailLogEntry> {
  const [row] = await db
    .insert(emailLog)
    .values({ ...input, orgId })
    .returning()
  return row
}

export async function listEmailLogEntries(orgId: string, limit = 50): Promise<EmailLogEntry[]> {
  return db
    .select()
    .from(emailLog)
    .where(eq(emailLog.orgId, orgId))
    .orderBy(desc(emailLog.sentAt))
    .limit(limit)
}
