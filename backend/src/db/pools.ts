import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as relations from "./relations"
import * as schema from "./schema"

// The API and the test suite run as the non-superuser `app` role
// (DATABASE_URL) so a missed authorization check can't reach data a
// row-level-security policy would otherwise block (see rls.ts). `adminDb`
// (DATABASE_ADMIN_URL) is the owner role, reserved for schema push, role
// grants, seed/bootstrap, and the reminder planner/dispatcher - they have no
// request and therefore no request-scoped org context to set `app.org_id`
// for, so their own org-scoped joins are what prevents cross-tenant reads,
// not RLS. pg.Pool connects lazily, so exporting both here costs nothing in a
// process that only ever uses one.
//
// `max` bounds how many connections the app role can hold at once. Each
// in-flight request now pins one connection for its full duration (see
// context.ts), so this is also a concurrency cap on simultaneous requests;
// raise it together with Postgres's own max_connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
})

const adminPool = new Pool({
  connectionString: process.env.DATABASE_ADMIN_URL,
})

export const appDb = drizzle(pool, { schema: { ...schema, ...relations } })
export const adminDb = drizzle(adminPool, { schema: { ...schema, ...relations } })
