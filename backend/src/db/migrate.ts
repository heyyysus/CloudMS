import "dotenv/config"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { ensureBootstrapRows } from "./bootstrap"
import { db } from "./index"

// Runs at container start (see Dockerfile CMD), before the server boots.
// Unlike db:seed this is safe against live data: migrations are append-only
// and ensureBootstrapRows() is insert-if-absent.
async function main() {
  await migrate(db, { migrationsFolder: "drizzle" })
  console.log("Migrations applied")

  await ensureBootstrapRows()

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
