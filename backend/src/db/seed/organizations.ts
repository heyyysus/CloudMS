import { sql } from "drizzle-orm"
import type { Organization } from "../../types"
import { adminDb as db } from "../index"
import { organizations } from "../schema"

export const DEFAULT_ORG_ID = 1
export const SECOND_ORG_ID = 2

// Explicit ids so the rest of the seed can thread orgId through without
// reading back the insert. setval keeps the serial in sync afterwards - the
// same fix-up bootstrap.ts does for organization 1 alone.
export async function seedOrganizations(): Promise<Organization[]> {
  const rows = await db
    .insert(organizations)
    .values([
      { id: DEFAULT_ORG_ID, name: "default org", slug: "default-org" },
      { id: SECOND_ORG_ID, name: "second org", slug: "second-org" },
    ])
    .returning()

  await db.execute(
    sql`SELECT setval('organizations_id_seq', GREATEST((SELECT max(id) FROM organizations), 1), true)`
  )

  return rows
}
