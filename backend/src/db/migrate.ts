import "dotenv/config"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { db } from "./index"
import { users } from "./schema"

// Runs at container start (see Dockerfile CMD), before the server boots.
// Unlike db:seed this is safe against live data: migrations are append-only
// and the admin bootstrap is an insert-if-absent.
async function main() {
  await migrate(db, { migrationsFolder: "drizzle" })
  console.log("Migrations applied")

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    await db
      .insert(users)
      .values({ email: adminEmail.toLowerCase(), role: "admin" })
      .onConflictDoNothing({ target: users.email })
    console.log(`Ensured admin user exists for ${adminEmail}`)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
