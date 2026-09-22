import { eq } from "drizzle-orm"
import { adminDb as db } from "./index"
import { users } from "./schema"

// Insert-if-absent then flag-on. Never sets the flag back to false: a
// bootstrap that revokes based on env drift would lock the owner out on a
// config typo, so an address that stops being PLATFORM_OWNER_EMAIL just
// keeps the capability rather than losing it silently on the next deploy.
export async function ensurePlatformOwner(): Promise<void> {
  const platformOwnerEmail = process.env.PLATFORM_OWNER_EMAIL
  if (!platformOwnerEmail) return

  const email = platformOwnerEmail.toLowerCase()
  await db.insert(users).values({ email }).onConflictDoNothing({ target: users.email })
  await db.update(users).set({ isPlatformOwner: true }).where(eq(users.email, email))
  console.log(`Ensured platform owner exists for ${email}`)
}
