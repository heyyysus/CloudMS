import { eq } from "drizzle-orm"
import { db } from "../index"
import {
  autoPolicies,
  carriers,
  clientEmails,
  clientPhones,
  clients,
  drivers,
  emailLog,
  persons,
  policyDrivers,
  sessions,
  users,
  vehicles,
} from "../schema"

export interface WipeOptions {
  // Demo mode only: rows in `users` with is_demo = true, and their sessions,
  // survive the wipe so a visitor mid-click isn't logged out by a reseed.
  // Every other caller (npm run db:seed) keeps today's full-wipe behaviour.
  preserveDemoUsers?: boolean
}

// FK-safe delete order. Deleting autoPolicies cascades away policyLogs,
// policyAttachments, policyLogAttachments, invoices, invoiceItems, payments,
// receipts, and trustLedger, so none of those need an explicit delete here.
// email_templates is left untouched so admin edits to it survive a reset.
export async function wipe(options: WipeOptions = {}): Promise<void> {
  const { preserveDemoUsers = false } = options

  if (!preserveDemoUsers) {
    await db.delete(sessions)
  }
  await db.delete(emailLog)
  await db.delete(policyDrivers)
  await db.delete(vehicles)
  await db.delete(autoPolicies)
  if (preserveDemoUsers) {
    // users.deleted_by is a self-FK with no onDelete action, so a surviving
    // demo user whose deleted_by points at a user about to be wiped would
    // abort the delete below - null it out first.
    await db.update(users).set({ deletedBy: null }).where(eq(users.isDemo, true))
    // sessions.user_id cascades on delete, so deleting only the non-demo
    // users is enough to take their sessions with them while demo sessions
    // survive untouched.
    await db.delete(users).where(eq(users.isDemo, false))
  } else {
    await db.delete(users)
  }
  await db.delete(clientPhones)
  await db.delete(clientEmails)
  await db.delete(clients)
  await db.delete(drivers)
  await db.delete(persons)
  await db.delete(carriers)
}
