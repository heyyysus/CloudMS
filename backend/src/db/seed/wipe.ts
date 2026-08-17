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

// FK-safe delete order. Deleting autoPolicies cascades away policyLogs,
// policyAttachments, policyLogAttachments, invoices, invoiceItems, payments,
// receipts, and trustLedger, so none of those need an explicit delete here.
// email_templates is left untouched so admin edits to it survive a reset.
export async function wipe(): Promise<void> {
  await db.delete(sessions)
  await db.delete(emailLog)
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
}
