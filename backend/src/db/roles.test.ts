import { sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { adminDb, db } from "./index"

// No TestContext here: these assert on the connection/role itself, not on
// domain rows, so there is nothing to create or clean up.
describe("app role", () => {
  it("connects as a non-superuser", async () => {
    const result = await db.execute<{ current_user: string; usesuper: boolean }>(
      sql`select current_user, (select usesuper from pg_user where usename = current_user) as usesuper`,
    )
    const [row] = result.rows
    expect(
      row.usesuper,
      `DATABASE_URL is connecting as a superuser (${row.current_user}) - it should point at the ` +
        "non-superuser app role. Check backend/.env against .env.example.",
    ).toBe(false)
  })

  it("is denied DDL", async () => {
    await expect(db.execute(sql`create table role_test_should_not_exist (id int)`)).rejects.toThrow()
  })

  it("re-running the grant script is a no-op", async () => {
    const grants = () =>
      adminDb.transaction(async (tx) => {
        await tx.execute(sql`GRANT USAGE ON SCHEMA public TO app`)
        await tx.execute(sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app`)
        await tx.execute(sql`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app`)
      })
    await grants()
    await expect(grants()).resolves.not.toThrow()
  })
})
