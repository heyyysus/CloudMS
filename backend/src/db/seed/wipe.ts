import { adminDb as db } from "../index"
import {
  autoPolicies,
  carriers,
  clientEmails,
  clientPhones,
  clients,
  drivers,
  emailLog,
  emailTemplates,
  organizations,
  orgMemberships,
  persons,
  policyDrivers,
  reminderRules,
  scheduledEmails,
  sessions,
  users,
  vehicles,
} from "../schema"

// FK-safe delete order. Deleting autoPolicies cascades away policyLogs,
// policyAttachments, policyLogAttachments, invoices, invoiceItems, payments,
// receipts, and trustLedger, so none of those need an explicit delete here.
// email_templates used to be left untouched "so admin edits survive a reset",
// but every row now carries an org_id FK to a row this wipe deletes, so it
// must go too (seedOrganizations re-inserts a welcome template per org).
// reminder_rules/scheduled_emails aren't seeded by anything today, but they'd
// block the email_templates delete (a non-cascading FK) if an admin created
// one by hand, so they're cleared defensively.
export async function wipe(): Promise<void> {
  await db.delete(sessions)
  await db.delete(emailLog)
  await db.delete(scheduledEmails)
  await db.delete(reminderRules)
  await db.delete(emailTemplates)
  // Cascades from deleting users/organizations below anyway; explicit for
  // readability of the FK-safe order.
  await db.delete(orgMemberships)
  await db.delete(policyDrivers)
  await db.delete(vehicles)
  await db.delete(autoPolicies)
  await db.delete(users)
  await db.delete(clientPhones)
  await db.delete(clientEmails)
  await db.delete(clients)
  await db.delete(drivers)
  await db.delete(persons)
  await db.delete(carriers)
  await db.delete(organizations)
}
