import request from "supertest"
import { afterEach, describe, expect, it } from "vitest"
import app from "../app"
import { db } from "../db"
import { trustLedger } from "../db/schema"
import { getTrustBalanceByClientId } from "../repositories"
import type { TrustLedgerDirection, TrustLedgerEntryType } from "../types"
import { runInOrg, TestContext } from "./testHelpers"

const ctx = new TestContext()
afterEach(() => ctx.cleanup())

interface EntryInput {
  orgId: string
  clientId: string
  policyId: string
  entryType?: TrustLedgerEntryType
  direction: TrustLedgerDirection
  amount: string
  createdAt: Date
  carrierId?: string
  reversalOfId?: string
}

// Inserted directly (there's no ledger-writing API for an arbitrary
// createdAt) inside runInOrg so the app-role RLS policy sees the right org.
async function insertEntry(input: EntryInput) {
  const [row] = await runInOrg(input.orgId, () =>
    db
      .insert(trustLedger)
      .values({
        orgId: input.orgId,
        clientId: input.clientId,
        policyId: input.policyId,
        entryType: input.entryType ?? "payment_received",
        direction: input.direction,
        amount: input.amount,
        createdAt: input.createdAt,
        carrierId: input.carrierId,
        reversalOfId: input.reversalOfId,
      })
      .returning()
  )
  return row
}

async function setupOrg(reminderTimezone = "America/Chicago") {
  const org = await ctx.org({ reminderTimezone })
  const admin = await ctx.user("tr-admin", "admin", org.id)
  const cookie = await ctx.cookie(admin.id, org.id)
  const client = await ctx.client({ orgId: org.id })
  const policy = await ctx.policy({ orgId: org.id, clientId: client.id })
  return { org, admin, cookie, client, policy }
}

describe("GET /trust-report/*", () => {
  it("buckets a late-night local entry into its own local month, not UTC's", async () => {
    const { org, cookie, client, policy } = await setupOrg()

    // 19:00 CST on Jan 31 is 01:00 UTC on Feb 1 - a UTC-only date_trunc would
    // put this in February.
    await insertEntry({
      orgId: org.id,
      clientId: client.id,
      policyId: policy.id,
      direction: "in",
      amount: "100.00",
      createdAt: new Date("2026-02-01T01:00:00.000Z"),
    })

    const res = await request(app).get("/trust-report/series?range=all-time").set("Cookie", cookie)
    expect(res.status).toBe(200)
    const januaryPoint = res.body.find((p: { bucket: string }) => p.bucket.startsWith("2026-01"))
    expect(januaryPoint).toBeTruthy()
    expect(januaryPoint.totalIn).toBe("100.00")
    expect(res.body.some((p: { bucket: string }) => p.bucket.startsWith("2026-02"))).toBe(false)
  })

  it("excludes a voided payment and the reversal that cancels it, from all three endpoints", async () => {
    const { org, cookie, client, policy } = await setupOrg()

    const original = await insertEntry({
      orgId: org.id,
      clientId: client.id,
      policyId: policy.id,
      direction: "in",
      amount: "50.00",
      createdAt: new Date("2026-03-01T12:00:00.000Z"),
    })
    await insertEntry({
      orgId: org.id,
      clientId: client.id,
      policyId: policy.id,
      direction: "out",
      amount: "50.00",
      createdAt: new Date("2026-03-01T13:00:00.000Z"),
      reversalOfId: original.id,
    })

    const summary = await request(app)
      .get("/trust-report/summary?range=all-time")
      .set("Cookie", cookie)
    expect(summary.body).toEqual({
      openingBalance: "0.00",
      totalIn: "0.00",
      totalOut: "0.00",
      closingBalance: "0.00",
    })

    const entries = await request(app)
      .get("/trust-report/entries?range=all-time")
      .set("Cookie", cookie)
    expect(entries.body.entries).toEqual([])
    expect(entries.body.total).toBe(0)
  })

  it("all-time closingBalance matches the client's raw trust balance when reversals cancel out", async () => {
    const { org, cookie, client, policy } = await setupOrg()

    const kept = await insertEntry({
      orgId: org.id,
      clientId: client.id,
      policyId: policy.id,
      direction: "in",
      amount: "75.00",
      createdAt: new Date("2026-04-10T15:00:00.000Z"),
    })
    const voided = await insertEntry({
      orgId: org.id,
      clientId: client.id,
      policyId: policy.id,
      direction: "in",
      amount: "20.00",
      createdAt: new Date("2026-04-11T15:00:00.000Z"),
    })
    await insertEntry({
      orgId: org.id,
      clientId: client.id,
      policyId: policy.id,
      direction: "out",
      amount: "20.00",
      createdAt: new Date("2026-04-11T16:00:00.000Z"),
      reversalOfId: voided.id,
    })

    const summary = await request(app)
      .get("/trust-report/summary?range=all-time")
      .set("Cookie", cookie)
    const rawBalance = await runInOrg(org.id, () => getTrustBalanceByClientId(org.id, client.id))
    expect(summary.body.closingBalance).toBe(rawBalance)
    expect(summary.body.closingBalance).toBe("75.00")
    expect(kept.id).toBeTruthy()
  })

  it("rejects a non-admin caller", async () => {
    const { org } = await setupOrg()
    const staff = await ctx.user("tr-staff", "staff", org.id)
    const cookie = await ctx.cookie(staff.id, org.id)

    const res = await request(app).get("/trust-report/summary?range=all-time").set("Cookie", cookie)
    expect(res.status).toBe(403)
  })

  it("400s a limit above the pagination cap", async () => {
    const { cookie } = await setupOrg()

    const res = await request(app)
      .get("/trust-report/entries?range=all-time&limit=500")
      .set("Cookie", cookie)
    expect(res.status).toBe(400)
  })

  it("paginates entries and filters by entryType", async () => {
    const { org, cookie, client, policy } = await setupOrg()

    for (let i = 0; i < 3; i++) {
      await insertEntry({
        orgId: org.id,
        clientId: client.id,
        policyId: policy.id,
        entryType: "payment_received",
        direction: "in",
        amount: "10.00",
        createdAt: new Date(`2026-05-0${i + 1}T12:00:00.000Z`),
      })
    }
    await insertEntry({
      orgId: org.id,
      clientId: client.id,
      policyId: policy.id,
      entryType: "agency_fee",
      direction: "out",
      amount: "5.00",
      createdAt: new Date("2026-05-04T12:00:00.000Z"),
    })

    const page1 = await request(app)
      .get("/trust-report/entries?range=all-time&limit=2&offset=0")
      .set("Cookie", cookie)
    expect(page1.body.total).toBe(4)
    expect(page1.body.entries).toHaveLength(2)
    // Newest first.
    expect(page1.body.entries[0].amount).toBe("5.00")

    const page2 = await request(app)
      .get("/trust-report/entries?range=all-time&limit=2&offset=2")
      .set("Cookie", cookie)
    expect(page2.body.entries).toHaveLength(2)
    expect(page1.body.entries.map((e: { id: string }) => e.id)).not.toEqual(
      expect.arrayContaining(page2.body.entries.map((e: { id: string }) => e.id))
    )

    const filtered = await request(app)
      .get("/trust-report/entries?range=all-time&entryType=agency_fee")
      .set("Cookie", cookie)
    expect(filtered.body.total).toBe(1)
    expect(filtered.body.entries[0].entryType).toBe("agency_fee")
  })
})
