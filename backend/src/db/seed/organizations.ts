import type { Organization } from "../../types"
import { adminDb as db } from "../index"
import { organizations } from "../schema"

export async function seedOrganizations(): Promise<Organization[]> {
  return db
    .insert(organizations)
    .values([
      { name: "default org", slug: "default-org" },
      { name: "second org", slug: "second-org" },
    ])
    .returning()
}
