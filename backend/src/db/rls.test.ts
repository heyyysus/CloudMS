import { sql } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { adminDb, db } from "../db"
import { clients, invoices, policyLogs } from "../db/schema"
import { runInOrg, TestContext } from "../routes/testHelpers"

const ctx = new TestContext()

afterEach(() => ctx.cleanup())

// Proves the actual acceptance criteria for issue #122, not just that the
// plumbing typechecks: a repository call that forgot its org filter, or a
// hand-written query with no filter at all, cannot see or touch another
// org's rows, because Postgres itself refuses - see rls.ts's policies.
describe("row-level security", () => {
  it("hides another org's rows from an unfiltered query inside an org context, and adminDb sees both", async () => {
    const orgAId = await ctx.orgId()
    const clientA = await ctx.client()
    const orgB = await ctx.org()
    const clientB = await ctx.client({ orgId: orgB.id })

    // No `where org_id = ...` at all - exactly the kind of query a
    // repository bug would produce. RLS, not the query, is what keeps org
    // B's row out of this result.
    const seenFromA = await runInOrg(orgAId, () =>
      db.execute<{ id: string; org_id: string }>(sql`select id, org_id from clients`)
    )
    const idsSeenFromA = seenFromA.rows.map((r) => r.id)
    expect(idsSeenFromA).toContain(clientA.id)
    expect(idsSeenFromA).not.toContain(clientB.id)

    // adminDb is the table owner and bypasses RLS entirely - the same
    // unfiltered query sees both orgs' rows.
    const seenByAdmin = await adminDb.execute<{ id: string }>(
      sql`select id from clients where id in (${clientA.id}, ${clientB.id})`
    )
    expect(seenByAdmin.rows.map((r) => r.id).sort()).toEqual([clientA.id, clientB.id].sort())
  })

  // Acceptance criterion 1: SELECT on any tenant table as `app` with no
  // app.org_id set returns zero rows, not an error and not everything. This
  // is the one place a global count assertion is legitimate (CLAUDE.md
  // otherwise forbids asserting on a global row count): RLS makes the count
  // deterministically zero outside any org context regardless of what other
  // tests or parallel workers have inserted, so there is nothing for
  // concurrency to make flaky.
  it("returns zero rows for tenant tables with no org context set", async () => {
    // Fixtures so each table actually has rows somewhere - a table that
    // happens to be empty would also count to zero without RLS doing
    // anything, which would make the assertion vacuous.
    const orgId = await ctx.orgId()
    const client = await ctx.client()
    const policy = await ctx.policy({ clientId: client.id })
    const staff = await ctx.user("RlsCountStaff")
    await ctx.log(policy.id, staff.id)
    await runInOrg(orgId, () =>
      db.insert(invoices).values({
        orgId,
        invoiceNumber: 1,
        policyId: policy.id,
        clientId: client.id,
        createdBy: staff.id,
        total: "100.00",
      })
    )

    for (const table of [clients, invoices, policyLogs] as const) {
      const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table)
      expect(row.count).toBe(0)
    }
  })
})
