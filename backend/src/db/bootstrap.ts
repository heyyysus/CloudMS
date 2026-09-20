import "dotenv/config"
import { and, eq, sql } from "drizzle-orm"
import { adminDb as db } from "./index"
import { emailTemplates, organizations, orgMemberships, users } from "./schema"
import { AUTOMATION_USER_EMAIL } from "../jobs/automationUser"

const DEFAULT_ORG_ID = 1

// Runs at container start (see Dockerfile CMD), after db:push and roles.ts,
// before the server boots. Unlike db:seed this is safe against live data:
// every insert below is insert-if-absent. Runs on adminDb since the app role
// has no reason to write these baseline rows itself.
async function main() {
  await db
    .insert(organizations)
    .values({ id: DEFAULT_ORG_ID, name: "default org", slug: "default-org" })
    .onConflictDoNothing({ target: organizations.id })
  // The serial sequence only advances on inserts that don't supply an
  // explicit id, so the id: 1 insert above leaves it at 0 and the next
  // id-less insert would collide on 1.
  await db.execute(
    sql`SELECT setval('organizations_id_seq', GREATEST((SELECT max(id) FROM organizations), 1), true)`
  )
  console.log("Ensured default organization exists")

  const adminEmail = process.env.ADMIN_EMAIL
  if (adminEmail) {
    await db
      .insert(users)
      .values({ email: adminEmail.toLowerCase() })
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
      isActive: false,
    })
    .onConflictDoNothing({ target: users.email })
  console.log("Ensured automation user exists")

  if (adminEmail) {
    const [adminUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, adminEmail.toLowerCase()))
    await db
      .insert(orgMemberships)
      .values({ userId: adminUser.id, orgId: DEFAULT_ORG_ID, role: "admin" })
      .onConflictDoNothing({ target: [orgMemberships.userId, orgMemberships.orgId] })
  }
  const [automationUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, AUTOMATION_USER_EMAIL))
  await db
    .insert(orgMemberships)
    .values({ userId: automationUser.id, orgId: DEFAULT_ORG_ID, role: "staff" })
    .onConflictDoNothing({ target: [orgMemberships.userId, orgMemberships.orgId] })
  console.log("Ensured default-org memberships exist")

  await db
    .insert(emailTemplates)
    .values({
      orgId: DEFAULT_ORG_ID,
      key: "welcome",
      kind: "welcome",
      subject: "Welcome to CloudMS, {{name}}",
      body: `Hi {{name}},

{{inviterName}} has invited you to CloudMS as {{role}}.

Sign in with your Google account ({{email}}) at {{appUrl}} - no password needed, access is already set up for this address.`,
    })
    .onConflictDoNothing({ target: [emailTemplates.orgId, emailTemplates.key] })
  // Reclassify a welcome row created before the `kind` column existed (the
  // column defaults to "correspondence"); insert-if-absent above won't touch it.
  await db
    .update(emailTemplates)
    .set({ kind: "welcome" })
    .where(and(eq(emailTemplates.orgId, DEFAULT_ORG_ID), eq(emailTemplates.key, "welcome")))
  console.log('Ensured "welcome" email template exists')

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
