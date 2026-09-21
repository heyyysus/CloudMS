import "dotenv/config"
import { sql } from "drizzle-orm"
import { adminDb } from "./pools"

// Isolation layer 2 (docs/multitenancy.md): even a repository call that
// forgot its `where org_id = ...` cannot return another organization's rows,
// because Postgres itself refuses to show them to the `app` role. Runs on
// adminDb (DATABASE_ADMIN_URL) since only the table owner may ALTER/CREATE
// POLICY - and FORCE ROW LEVEL SECURITY additionally binds the *owner*, so
// this only holds if DATABASE_ADMIN_URL is a superuser (true in every
// environment this repo runs in today, per .env.example/docker-compose.yml/
// ci.yml). If that ever changes, `ALTER ROLE ... BYPASSRLS` on the owner role
// restores today's behavior.
//
// Every statement here is idempotent, so this is safe to run after every
// db:push, including the first one.

// The 21 tenant tables, listed literally rather than discovered by
// reflection so adding a table is a visible edit here, not something that
// falls out of a schema scan. Kept in the same order schema.ts declares them.
const TENANT_TABLES = [
  "persons",
  "drivers",
  "clients",
  "client_phones",
  "client_emails",
  "carriers",
  "auto_policies",
  "vehicles",
  "policy_drivers",
  "policy_logs",
  "policy_attachments",
  "policy_log_attachments",
  "invoices",
  "invoice_items",
  "payments",
  "receipts",
  "trust_ledger",
  "email_templates",
  "email_log",
  "reminder_rules",
  "scheduled_emails",
] as const

// Deliberately not RLS-protected. users/sessions/org_memberships are what the
// issue itself carves out. organizations joins them: findOrganizationById /
// listActiveMembershipsWithOrg back GET /auth/me and run under
// requireSession, before any org context exists (that's the whole point of
// the org picker), so a row policy on organizations keyed on app.org_id would
// 404 the picker itself. All four are reached only through the auth layer,
// not through a repository that forgot an org_id filter, so RLS has nothing
// to backstop here. See docs/multitenancy.md and rls.test.ts / crossTenant.test.ts
// for what does cover them.
const AUTH_LAYER_TABLES = ["users", "sessions", "org_memberships", "organizations"]

async function applyTenantTablePolicy(
  tx: Parameters<Parameters<typeof adminDb.transaction>[0]>[0],
  table: string
) {
  const policy = `${table}_org_isolation`
  await tx.execute(sql.raw(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`))
  await tx.execute(sql.raw(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`))
  await tx.execute(sql.raw(`DROP POLICY IF EXISTS ${policy} ON ${table}`))
  // No ::int cast: org_id is varchar(22) (schema.ts, via rowIdFk) and
  // current_setting(...) is already text. Unset app.org_id -> NULL -> the
  // predicate is NULL -> zero rows, not "unrestricted" - that's what makes a
  // request outside any org context see nothing rather than everything.
  await tx.execute(
    sql.raw(`
      CREATE POLICY ${policy} ON ${table} FOR ALL TO app
        USING (org_id = current_setting('app.org_id', true))
        WITH CHECK (org_id = current_setting('app.org_id', true))
    `)
  )
}

// Guards against a future tenant table (one with an org_id column) getting
// added to schema.ts without a matching entry in TENANT_TABLES above - this
// throws instead of silently leaving the new table unprotected.
async function assertTableListComplete(
  tx: Parameters<Parameters<typeof adminDb.transaction>[0]>[0]
) {
  const rows = await tx.execute<{ table_name: string }>(sql`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'org_id'
  `)
  const known = new Set<string>([...TENANT_TABLES, ...AUTH_LAYER_TABLES])
  const missing = rows.rows.map((r) => r.table_name).filter((name) => !known.has(name))
  if (missing.length > 0) {
    throw new Error(
      `rls.ts: table(s) with an org_id column are missing an RLS policy: ${missing.join(", ")}. ` +
        "Add them to TENANT_TABLES (or AUTH_LAYER_TABLES, with a reason) in backend/src/db/rls.ts."
    )
  }
}

async function main() {
  await adminDb.transaction(async (tx) => {
    await assertTableListComplete(tx)
    for (const table of TENANT_TABLES) {
      await applyTenantTablePolicy(tx, table)
    }
  })
  console.log(`Applied row-level security to ${TENANT_TABLES.length} tenant tables`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
