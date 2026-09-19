import "dotenv/config"
import { eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { db } from "./index"
import { emailTemplates, users } from "./schema"
import { AUTOMATION_USER_EMAIL } from "../jobs/automationUser"

// Runs at container start (see Dockerfile CMD), before the server boots.
// Unlike db:seed this is safe against live data: migrations are append-only
// and the admin bootstrap / template seed are both insert-if-absent.
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

  // The author/sender of record for anything the scheduler sends, since
  // policy_logs.author_id is NOT NULL and sendCorrespondenceEmail wants a
  // user id. isActive: false means requireAuth rejects it, so bootstrapping
  // this row can never become a way to sign in.
  await db
    .insert(users)
    .values({
      email: AUTOMATION_USER_EMAIL,
      name: "CloudMS Automation",
      role: "staff",
      isActive: false,
    })
    .onConflictDoNothing({ target: users.email })
  console.log("Ensured automation user exists")

  await db
    .insert(emailTemplates)
    .values({
      key: "welcome",
      kind: "welcome",
      subject: "Welcome to CloudMS, {{name}}",
      body: `Hi {{name}},

{{inviterName}} has invited you to CloudMS as {{role}}.

Sign in with your Google account ({{email}}) at {{appUrl}} - no password needed, access is already set up for this address.`,
    })
    .onConflictDoNothing({ target: emailTemplates.key })
  // Reclassify a welcome row created before the `kind` column existed (the
  // column defaults to "correspondence"); insert-if-absent above won't touch it.
  await db.update(emailTemplates).set({ kind: "welcome" }).where(eq(emailTemplates.key, "welcome"))
  console.log('Ensured "welcome" email template exists')

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
