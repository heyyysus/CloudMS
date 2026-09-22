import { randomInt } from "crypto"
import { sql } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { needsDefaultOrg } from "./backfillOrgIds"
import { adminDb } from "./index"

// This script's own table, so the orphan branch can be exercised without
// dropping NOT NULL on a real one - the database is shared with other test
// runs (see CLAUDE.md), and that DDL would be visible to all of them. The
// suffix keeps two parallel runs off each other's fixture.
const fixture = `backfill_org_ids_test_${randomInt(1e9)}`

afterEach(async () => {
  await adminDb.execute(sql.raw(`drop table if exists ${fixture}`))
})

describe("needsDefaultOrg", () => {
  // The branch that carries the change: bootstrap.ts no longer creates
  // `default-org`, so on a database that has already been backfilled this
  // script must not put it back on every container start.
  it("is false when no table holds a null org_id", async () => {
    await expect(needsDefaultOrg()).resolves.toBe(false)
  })

  // Runs before push, so on a fresh database the tables it names may not
  // exist yet; a missing one is not an orphan.
  it("skips a table that does not exist", async () => {
    await expect(needsDefaultOrg([fixture])).resolves.toBe(false)
  })

  it("is true as soon as one table holds a null org_id", async () => {
    await adminDb.execute(sql.raw(`create table ${fixture} (org_id text)`))
    await expect(needsDefaultOrg([fixture])).resolves.toBe(false)

    await adminDb.execute(sql.raw(`insert into ${fixture} (org_id) values (null)`))
    await expect(needsDefaultOrg([fixture])).resolves.toBe(true)
  })

  // A backfilled row is not an orphan: the scan keys off the null, not off
  // the row existing, or every later boot would recreate the default org.
  it("is false once that row has an org_id", async () => {
    await adminDb.execute(sql.raw(`create table ${fixture} (org_id text)`))
    await adminDb.execute(sql.raw(`insert into ${fixture} (org_id) values ('some-org-id')`))
    await expect(needsDefaultOrg([fixture])).resolves.toBe(false)
  })
})
