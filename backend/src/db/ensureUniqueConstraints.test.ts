import { sql } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import {
  declaredUniqueConstraints,
  ensureUniqueConstraints,
  isUniqueViolation,
} from "./ensureUniqueConstraints"
import { adminDb } from "./index"
import { invoices, receipts, users } from "./schema"
import { TestContext } from "../routes/testHelpers"

const ctx = new TestContext()

afterEach(async () => {
  await ctx.cleanup()
})

describe("declaredUniqueConstraints", () => {
  // The two that production is missing, and that push cannot add on its own
  // once the tables hold rows.
  it("reports the org-scoped document number constraints", () => {
    expect(declaredUniqueConstraints(receipts).constraints).toContainEqual({
      name: "receipts_org_id_receipt_number_unique",
      columns: ["org_id", "receipt_number"],
      nullsNotDistinct: false,
    })
    expect(declaredUniqueConstraints(invoices).constraints).toContainEqual({
      name: "invoices_org_id_invoice_number_unique",
      columns: ["org_id", "invoice_number"],
      nullsNotDistinct: false,
    })
  })

  // push emits a create_unique_constraint statement for a column-level
  // .unique() too, so the scan has to see those as well or one of them could
  // still stall a boot.
  it("reports column-level .unique() constraints", () => {
    expect(declaredUniqueConstraints(users).constraints).toContainEqual({
      name: "users_email_unique",
      columns: ["email"],
      nullsNotDistinct: false,
    })
  })

  it("derives the table name from the schema", () => {
    expect(declaredUniqueConstraints(receipts).tableName).toBe("receipts")
  })
})

describe("isUniqueViolation", () => {
  // The SQLSTATE is never on the error drizzle actually throws - it wraps the
  // driver error and puts it on `cause`. Reading only the top level is how
  // the duplicate case ends up reported as a raw query dump instead of the
  // message telling the operator which rows to go and fix.
  it("finds the code on a wrapped driver error", () => {
    const wrapped = new Error("Failed query: alter table ...", {
      cause: Object.assign(new Error("duplicate key value"), { code: "23505" }),
    })
    expect(isUniqueViolation(wrapped)).toBe(true)
  })

  it("finds the code on an unwrapped driver error", () => {
    expect(isUniqueViolation(Object.assign(new Error("dup"), { code: "23505" }))).toBe(true)
  })

  it("rejects a different SQLSTATE", () => {
    const wrapped = new Error("Failed query", {
      cause: Object.assign(new Error("undefined column"), { code: "42703" }),
    })
    expect(isUniqueViolation(wrapped)).toBe(false)
  })

  it("rejects an error carrying no SQLSTATE at all", () => {
    expect(isUniqueViolation(new Error("connection refused"))).toBe(false)
  })
})

describe("ensureUniqueConstraints", () => {
  // Runs on every boot, so "nothing left to do" has to be the normal, silent
  // outcome rather than an error or a duplicate-constraint attempt.
  it("adds nothing when every declared constraint is already present", async () => {
    await expect(ensureUniqueConstraints()).resolves.toBe(0)
    await expect(ensureUniqueConstraints()).resolves.toBe(0)
  })

  // The whole point of the boot step: whatever it leaves behind, the
  // constraint push would have prompted about is in place.
  it("leaves the org-scoped receipt constraint in place", async () => {
    await ensureUniqueConstraints()

    const result = await adminDb.execute<{ exists: boolean }>(
      sql`select exists (
        select 1
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        where t.relname = 'receipts'
          and c.conname = 'receipts_org_id_receipt_number_unique'
          and c.contype = 'u'
      ) as exists`
    )
    expect(result.rows[0].exists).toBe(true)
  })
})
