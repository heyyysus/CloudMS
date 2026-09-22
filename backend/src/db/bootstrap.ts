import "dotenv/config"
import { adminDb as db } from "./index"
import { ensurePlatformOwner } from "./platformOwner"
import { users } from "./schema"
import { AUTOMATION_USER_EMAIL } from "../jobs/automationUser"

// Runs at container start (see Dockerfile CMD), after db:push and roles.ts,
// before the server boots. Unlike db:seed this is safe against live data:
// every insert below is insert-if-absent. Runs on adminDb since the app role
// has no reason to write these baseline rows itself.
async function main() {
  // No-ops unless PLATFORM_OWNER_EMAIL is set, which CI does not set - so it
  // fails loudly like every other step here rather than hiding a bad seed.
  // The platform owner creates the first organization themselves (POST
  // /organizations, #162) - bootstrap no longer creates one.
  await ensurePlatformOwner()

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

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
