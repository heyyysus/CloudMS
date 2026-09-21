import "dotenv/config"
import { eq, sql } from "drizzle-orm"
import { adminDb as db } from "./index"
import { organizations } from "./schema"

// Runs once at container start, before `drizzle-kit push` (see Dockerfile
// CMD) - push is what emits `SET NOT NULL` on org_id, and that fails outright
// against any row still holding a NULL. Idempotent and safe against live
// data: every statement below only ever touches rows where org_id is null.
//
// Root tables (no org-bearing parent) get the default org - these are
// pre-multitenancy rows, and the default org is what bootstrap.ts already
// treats as their home. Child tables derive their org from the parent row
// the plan names, so a row never ends up in a different org than the record
// it belongs to.
//
// Runs ahead of push, so on a genuinely fresh database none of these tables
// exist yet - there is nothing to backfill, and push will create them (with
// org_id already NOT NULL) right after. Every statement checks for its table
// first rather than letting a bare "relation does not exist" abort the boot.
async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(
    sql`select exists (select 1 from information_schema.tables where table_name = ${name}) as exists`
  )
  return result.rows[0]?.exists === true
}

async function backfillFromDefaultOrg(table: string, defaultOrgId: string): Promise<void> {
  if (!(await tableExists(table))) {
    console.log(`Skipped ${table} (table does not exist yet)`)
    return
  }
  const result = await db.execute(
    sql`update ${sql.identifier(table)} set org_id = ${defaultOrgId} where org_id is null`
  )
  console.log(`Backfilled ${result.rowCount ?? 0} row(s) in ${table} to the default org`)
}

async function backfillFromParent(
  table: string,
  parentTable: string,
  parentFkColumn: string
): Promise<void> {
  if (!(await tableExists(table))) {
    console.log(`Skipped ${table} (table does not exist yet)`)
    return
  }
  const result = await db.execute(sql`
    update ${sql.identifier(table)} t
    set org_id = p.org_id
    from ${sql.identifier(parentTable)} p
    where t.org_id is null and t.${sql.identifier(parentFkColumn)} = p.id
  `)
  console.log(`Backfilled ${result.rowCount ?? 0} row(s) in ${table} from ${parentTable}`)
}

async function main() {
  if (!(await tableExists("organizations"))) {
    console.log("Skipped org_id backfill (fresh database, no tables yet)")
    process.exit(0)
  }

  await db
    .insert(organizations)
    .values({ name: "default org", slug: "default-org" })
    .onConflictDoNothing({ target: organizations.slug })
  const [defaultOrg] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "default-org"))
  const defaultOrgId = defaultOrg.id
  console.log("Ensured default organization exists")

  // Pre-multitenancy rows with no org-bearing parent: assign them to the
  // default org, exactly as bootstrap.ts already treats it as their home.
  for (const table of ["persons", "clients", "carriers", "auto_policies", "reminder_rules"]) {
    await backfillFromDefaultOrg(table, defaultOrgId)
  }

  // email_log has no parent that outlives it (the recipient may not even
  // resolve to a live client), so it gets the default org like the tables
  // above.
  await backfillFromDefaultOrg("email_log", defaultOrgId)

  // email_templates is the one root table that can collide: the (org_id,
  // key) unique means an orphan row backfilled into the default org clashes
  // with one already bootstrapped there. Delete the orphan when a same-key
  // row already exists in the default org, otherwise adopt it.
  if (await tableExists("email_templates")) {
    const deleted = await db.execute(sql`
      delete from email_templates orphan
      using email_templates existing
      where orphan.org_id is null
        and existing.org_id = ${defaultOrgId}
        and existing.key = orphan.key
        and existing.id <> orphan.id
    `)
    console.log(
      `Deleted ${deleted.rowCount ?? 0} orphaned email_templates row(s) with a duplicate key`
    )
    await backfillFromDefaultOrg("email_templates", defaultOrgId)
  } else {
    console.log("Skipped email_templates (table does not exist yet)")
  }

  // Child tables derive their org from the parent the plan names, rather than
  // guessing - a row can only ever be assigned to the org its parent is
  // actually in.
  for (const table of ["scheduled_emails", "vehicles", "policy_drivers", "policy_logs", "policy_attachments"]) {
    await backfillFromParent(table, "auto_policies", "policy_id")
  }
  await backfillFromParent("policy_log_attachments", "policy_logs", "log_id")
  await backfillFromParent("drivers", "persons", "person_id")
  await backfillFromParent("client_phones", "clients", "client_id")
  await backfillFromParent("client_emails", "clients", "client_id")
  // Not named as a root table or explicitly in the plan's child list, but it
  // carries a NOT NULL policy_id, so it derives the same way as the other
  // auto_policies children rather than defaulting to the default org.
  await backfillFromParent("invoices", "auto_policies", "policy_id")
  await backfillFromParent("invoice_items", "invoices", "invoice_id")
  await backfillFromParent("payments", "invoices", "invoice_id")
  await backfillFromParent("receipts", "invoices", "invoice_id")
  // trust_ledger.invoice_id is nullable (unlike payments/receipts), but
  // policy_id is always set, so derive from auto_policies instead - deriving
  // from invoices would strand any row whose invoice_id is null.
  await backfillFromParent("trust_ledger", "auto_policies", "policy_id")

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
