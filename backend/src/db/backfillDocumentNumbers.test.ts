import { eq, inArray } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { backfillDocumentNumbers } from "./backfillDocumentNumbers"
import { adminDb } from "./index"
import { invoices, organizations } from "./schema"
import { TestContext } from "../routes/testHelpers"

const ctx = new TestContext()
const createdInvoiceIds: string[] = []

afterEach(async () => {
  if (createdInvoiceIds.length > 0) {
    await adminDb.delete(invoices).where(inArray(invoices.id, createdInvoiceIds))
    createdInvoiceIds.length = 0
  }
  await ctx.cleanup()
})

async function invoiceNumbered(orgId: string, invoiceNumber: number): Promise<void> {
  const client = await ctx.client({ orgId })
  const policy = await ctx.policy({ orgId, clientId: client.id })
  const user = await ctx.user("doc-numbers", "staff", orgId)
  const [row] = await adminDb
    .insert(invoices)
    .values({
      orgId,
      invoiceNumber,
      policyId: policy.id,
      clientId: client.id,
      createdBy: user.id,
      total: "250.00",
    })
    .returning({ id: invoices.id })
  createdInvoiceIds.push(row.id)
}

async function counterFor(orgId: string): Promise<number> {
  const [row] = await adminDb
    .select({ next: organizations.nextInvoiceNumber })
    .from(organizations)
    .where(eq(organizations.id, orgId))
  return row.next
}

describe("backfillDocumentNumbers", () => {
  // The live-data case: rows carry numbers from the old globally-allocated
  // scheme, while the per-org counter is still sitting at its default of 1.
  // Left alone, the next invoice created is handed a number already in use.
  it("carries a stale counter past the numbers already in use", async () => {
    const org = await ctx.org()
    await invoiceNumbered(org.id, 412)
    expect(await counterFor(org.id)).toBe(1)

    await backfillDocumentNumbers()

    expect(await counterFor(org.id)).toBe(413)
  })

  // Runs on every boot, so a second pass must not keep moving the counter -
  // that would burn a number per restart.
  it("leaves an already-current counter alone", async () => {
    const org = await ctx.org()
    await invoiceNumbered(org.id, 7)

    await backfillDocumentNumbers()
    const afterFirst = await counterFor(org.id)
    await backfillDocumentNumbers()

    expect(afterFirst).toBe(8)
    expect(await counterFor(org.id)).toBe(afterFirst)
  })

  // A counter that is already ahead (an org created after the switch, whose
  // allocations have outrun its stored rows) must never be pulled back down.
  it("never lowers a counter that is already ahead", async () => {
    const org = await ctx.org({ nextInvoiceNumber: 500 })
    await invoiceNumbered(org.id, 12)

    await backfillDocumentNumbers()

    expect(await counterFor(org.id)).toBe(500)
  })

  // An org with no invoices at all has nothing to carry forward.
  it("leaves an organization with no documents at 1", async () => {
    const org = await ctx.org()

    await backfillDocumentNumbers()

    expect(await counterFor(org.id)).toBe(1)
  })
})
