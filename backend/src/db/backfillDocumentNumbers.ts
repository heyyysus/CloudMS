import "dotenv/config"
import { sql } from "drizzle-orm"
import { adminDb as db } from "./index"

// Runs once at container start, before the server boots (see Dockerfile CMD).
//
// Invoice and receipt numbers used to be allocated globally by the database
// (a plain identity column on each table). They are now allocated per
// organization from organizations.next_invoice_number /
// next_receipt_number - see repositories/organizations.ts - and both columns
// default to 1. On a live database that already holds invoices and receipts
// numbered from the old scheme, that default means the first document
// created after the switch is handed a number the table is already using:
// either a duplicate (before the org-scoped unique constraints exist) or an
// outright insert failure (after ensureUniqueConstraints.ts adds them).
//
// So carry the counters forward to one past the highest number each
// organization has actually used. GREATEST only ever raises a counter, which
// makes this safe to re-run on every boot: an organization whose counter has
// already moved past its stored rows keeps it, and no number is ever handed
// out twice.
async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(
    sql`select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${name}
    ) as exists`
  )
  return result.rows[0]?.exists === true
}

export async function carryCounterForward(
  table: string,
  numberColumn: string,
  counterColumn: string
): Promise<void> {
  // Runs ahead of push, so on a fresh database the table may not exist yet -
  // there is nothing to carry forward, and every counter is correct at 1.
  if (!(await tableExists(table))) {
    console.log(`Skipped ${counterColumn} (${table} does not exist yet)`)
    return
  }

  const result = await db.execute(sql`
    update organizations o
    set ${sql.identifier(counterColumn)} =
      greatest(o.${sql.identifier(counterColumn)}, used.highest + 1)
    from (
      select org_id, max(${sql.identifier(numberColumn)}) as highest
      from ${sql.identifier(table)}
      group by org_id
    ) used
    where used.org_id = o.id
      and o.${sql.identifier(counterColumn)} <= used.highest
  `)
  console.log(`Carried ${counterColumn} forward for ${result.rowCount ?? 0} organization(s)`)
}

export async function backfillDocumentNumbers(): Promise<void> {
  if (!(await tableExists("organizations"))) {
    console.log("Skipped document number backfill (fresh database, no tables yet)")
    return
  }

  await carryCounterForward("invoices", "invoice_number", "next_invoice_number")
  await carryCounterForward("receipts", "receipt_number", "next_receipt_number")
}

// Only when run as the boot step, so the tests can import the function above
// without the module exiting the process out from under them.
if (require.main === module) {
  backfillDocumentNumbers()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
