import "dotenv/config"
import { sql } from "drizzle-orm"
import { adminDb } from "./index"

// Grants the non-superuser `app` role least-privilege access to the schema
// `drizzle-kit push` just applied. Runs on adminDb (DATABASE_ADMIN_URL): default
// privileges attach to the granting role, so this must run as the same owner
// role push runs as. See docs/multitenancy.md's row-level-security step, which
// this role split prepares for ahead of time.
//
// Idempotent: safe to run after every push, including the first one.
async function main() {
  const password = process.env.APP_DB_PASSWORD ?? "password"

  // Postgres has no CREATE ROLE ... IF NOT EXISTS, and a role name/password
  // can't be bound as a query parameter inside DDL (CREATE/ALTER ROLE's
  // grammar wants a literal, not an expression) or inside a DO $$ ... $$ body
  // (dollar-quoted text isn't parsed for $1 placeholders at all). So the
  // password is handed to Postgres once as an ordinary parameterized value via
  // set_config, then read back and quoted server-side with format('%L', ...)
  // wherever DDL needs it. Everything runs in one transaction so the session
  // GUC set here is still visible to the statements below (a pool can hand
  // out a different connection per query otherwise).
  await adminDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('cloudms.app_db_password', ${password}, true)`)

    await tx.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
          EXECUTE format('CREATE ROLE app LOGIN PASSWORD %L', current_setting('cloudms.app_db_password'));
        END IF;
      END
      $$;
    `)

    // Unconditional so a changed APP_DB_PASSWORD takes effect on re-run.
    await tx.execute(sql`
      DO $$
      BEGIN
        EXECUTE format('ALTER ROLE app WITH LOGIN PASSWORD %L', current_setting('cloudms.app_db_password'));
      END
      $$;
    `)

    await tx.execute(sql`
      DO $$
      BEGIN
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO app', current_database());
      END
      $$;
    `)
    await tx.execute(sql`GRANT USAGE ON SCHEMA public TO app`)
    await tx.execute(
      sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app`
    )
    await tx.execute(sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app`)
    await tx.execute(
      sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app`
    )
    await tx.execute(
      sql`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app`
    )
  })
  console.log("Ensured app role exists with up-to-date privileges")

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
