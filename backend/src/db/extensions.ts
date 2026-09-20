import "dotenv/config"
import { sql } from "drizzle-orm"
import { adminDb } from "./index"

// Run ahead of `drizzle-kit push` (see package.json's db:push script and
// Dockerfile CMD): row ids' Postgres DEFAULT needs gen_random_bytes
// (pgcrypto), and several schema indexes need gin_trgm_ops (pg_trgm). Both
// resolve at DDL time, so push fails without them. Idempotent and safe on a
// shared database - CREATE EXTENSION IF NOT EXISTS is a no-op on repeat runs.
async function main() {
  await adminDb.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`)
  await adminDb.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`)
  console.log("Ensured pgcrypto and pg_trgm extensions exist")
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
