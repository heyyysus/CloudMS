import { eq } from "drizzle-orm"
import { db } from "../db"
import { users } from "../db/schema"
import type { User } from "../types"

// Bootstrapped by src/db/migrate.ts. Deliberately a .local address: it must
// never be deliverable, and it is only ever used as a lookup key.
export const AUTOMATION_USER_EMAIL = "automation@cloudms.local"

let cached: User | undefined

// The user rows written by the scheduler are attributed to: policy_logs
// requires a non-null author, and email_log.triggered_by should answer "who
// sent this" with something more useful than null. Cached after the first
// lookup since the row never changes within a process.
export async function getAutomationUser(): Promise<User> {
  if (cached) return cached
  const found = await db.query.users.findFirst({
    where: eq(users.email, AUTOMATION_USER_EMAIL),
  })
  if (!found) {
    throw new Error(`Automation user ${AUTOMATION_USER_EMAIL} is missing - run src/db/migrate.ts`)
  }
  cached = found
  return found
}

// Tests create and drop the row between cases; without this they would see a
// stale id from an earlier case.
export function resetAutomationUserCache(): void {
  cached = undefined
}
