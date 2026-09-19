import "dotenv/config"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import * as relations from "./relations"
import * as schema from "./schema"

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// The API, the scheduler and the test suite all run as the non-superuser
// `app` role (DATABASE_URL) so a missed authorization check can't reach data
// SQL alone wouldn't stop it from touching. `adminDb` (DATABASE_ADMIN_URL) is
// the owner role, reserved for schema push, role grants and seed/bootstrap.
// See docs/multitenancy.md's row-level-security step, which this role split
// prepares for ahead of time. pg.Pool connects lazily, so exporting both here
// costs nothing in a process that only ever uses one.
const adminPool = new Pool({
  connectionString: process.env.DATABASE_ADMIN_URL,
})

export const db = drizzle(pool, { schema: { ...schema, ...relations } })
export const adminDb = drizzle(adminPool, { schema: { ...schema, ...relations } })
