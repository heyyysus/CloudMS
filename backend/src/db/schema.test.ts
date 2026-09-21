import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { adminDb } from "./index"

// #121 restored org_id NOT NULL on every tenant table after backfilling any
// legacy NULL row. This is a database-level guarantee, not just an
// application-level one - assert it directly so a future `db:push` that
// silently drops the constraint fails a test instead of shipping a leak.
// carriers has no other required foreign keys, so this needs no other
// fixture rows.
describe("org_id NOT NULL", () => {
  it("rejects a raw insert into a tenant table with no org_id", async () => {
    await expect(
      adminDb.execute(sql`insert into carriers (name, naic) values ('No Org Inc', '0000000000')`)
    ).rejects.toMatchObject({
      cause: { message: expect.stringContaining('null value in column "org_id"') },
    })
  })
})
