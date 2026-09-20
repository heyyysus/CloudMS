import { like } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { db } from "../db"
import { organizations } from "../db/schema"
import { findOrganizationById, findOrganizationBySlug } from "./index"

const testSlugPrefix = "orgs-repo-test-"

function makeOrg(suffix: string) {
  return db
    .insert(organizations)
    .values({ name: `Orgs Repo Test ${suffix}`, slug: `${testSlugPrefix}${suffix}` })
    .returning()
    .then(([row]) => row)
}

afterEach(async () => {
  await db.delete(organizations).where(like(organizations.slug, `${testSlugPrefix}%`))
})

describe("organizations repository", () => {
  it("creates a row with default invoice/receipt counters and finds it by id", async () => {
    const org = await makeOrg("by-id")

    expect(org.nextInvoiceNumber).toBe(1)
    expect(org.nextReceiptNumber).toBe(1)

    const found = await findOrganizationById(org.id)
    expect(found?.slug).toBe(org.slug)
  })

  it("returns undefined for an unknown id", async () => {
    expect(await findOrganizationById("unknown000000000000000")).toBeUndefined()
  })

  it("finds an organization by slug", async () => {
    const org = await makeOrg("by-slug")

    const found = await findOrganizationBySlug(org.slug)
    expect(found?.id).toBe(org.id)
  })

  it("returns undefined for an unknown slug", async () => {
    expect(await findOrganizationBySlug(`${testSlugPrefix}nope`)).toBeUndefined()
  })
})
