import { and, desc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm"
import { db } from "../db"
import {
  autoPolicies,
  carriers,
  clients,
  invoiceItems,
  organizations,
  persons,
  trustLedger,
} from "../db/schema"
import { centsToAmount, toCents } from "../money"
import type {
  InvoiceItemType,
  TrustLedgerDirection,
  TrustLedgerEntry,
  TrustLedgerEntryType,
} from "../types"

const withCarrier = { carrier: { columns: { id: true, name: true } } } as const

export async function listTrustLedgerByPolicyId(orgId: string, policyId: string) {
  return db.query.trustLedger.findMany({
    where: and(eq(trustLedger.policyId, policyId), eq(trustLedger.orgId, orgId)),
    orderBy: [desc(trustLedger.createdAt), desc(trustLedger.id)],
    with: withCarrier,
  })
}

export async function listTrustLedgerByClientId(orgId: string, clientId: string) {
  return db.query.trustLedger.findMany({
    where: and(eq(trustLedger.clientId, clientId), eq(trustLedger.orgId, orgId)),
    orderBy: [desc(trustLedger.createdAt), desc(trustLedger.id)],
    with: withCarrier,
  })
}

// Trust balance = money in - money out, over the scoped entries. Reversals are
// ordinary opposite-direction rows, so they net out here automatically.
function balanceOf(entries: Pick<TrustLedgerEntry, "direction" | "amount">[]): string {
  const cents = entries.reduce(
    (acc, e) => acc + (e.direction === "in" ? toCents(e.amount) : -toCents(e.amount)),
    0
  )
  return centsToAmount(cents)
}

export async function getTrustBalanceByPolicyId(orgId: string, policyId: string): Promise<string> {
  const rows = await db
    .select({ direction: trustLedger.direction, amount: trustLedger.amount })
    .from(trustLedger)
    .where(and(eq(trustLedger.policyId, policyId), eq(trustLedger.orgId, orgId)))
  return balanceOf(rows)
}

export async function getTrustBalanceByClientId(orgId: string, clientId: string): Promise<string> {
  const rows = await db
    .select({ direction: trustLedger.direction, amount: trustLedger.amount })
    .from(trustLedger)
    .where(and(eq(trustLedger.clientId, clientId), eq(trustLedger.orgId, orgId)))
  return balanceOf(rows)
}

export const TRUST_REPORT_RANGES = ["this-month", "last-3-months", "ytd", "all-time"] as const
export type TrustReportRange = (typeof TRUST_REPORT_RANGES)[number]

const RANGE_GRANULARITY: Record<TrustReportRange, "day" | "week" | "month"> = {
  "this-month": "day",
  "last-3-months": "week",
  ytd: "month",
  "all-time": "month",
}

// A row counts as-corrected only if it isn't itself a reversal (reversalOfId
// is null) and nothing has reversed it - the void path (payments.ts) never
// mutates the original entry, it inserts a mirror-direction row pointing back
// at it, so both sides of a reversed pair must be dropped to see money as it
// stands today.
function asCorrected(orgId: string) {
  const reversedIds = db
    .select({ id: trustLedger.reversalOfId })
    .from(trustLedger)
    .where(and(eq(trustLedger.orgId, orgId), isNotNull(trustLedger.reversalOfId)))
  return and(
    eq(trustLedger.orgId, orgId),
    isNull(trustLedger.reversalOfId),
    notInArray(trustLedger.id, reversedIds)
  )
}

// created_at is stored as a UTC instant; reading it back as the organization's
// wall clock (the inverse of the write-path idiom at jobs/planner.ts:52-53) is
// what lets date_trunc bucket by the org's own calendar days/weeks/months
// instead of UTC's.
function localCreatedAt() {
  return sql`(${trustLedger.createdAt} at time zone 'UTC' at time zone ${organizations.reminderTimezone})`
}

// The org-local wall-clock instant a range begins, or null for "all-time"
// (no lower bound).
function rangeStart(range: TrustReportRange) {
  switch (range) {
    case "this-month":
      return sql`date_trunc('month', now() at time zone ${organizations.reminderTimezone})`
    case "last-3-months":
      return sql`(date_trunc('month', now() at time zone ${organizations.reminderTimezone}) - interval '2 months')`
    case "ytd":
      return sql`date_trunc('year', now() at time zone ${organizations.reminderTimezone})`
    case "all-time":
      return null
  }
}

function beforeRange(range: TrustReportRange) {
  const start = rangeStart(range)
  return start === null ? sql`false` : sql`${localCreatedAt()} < ${start}`
}

function inRange(range: TrustReportRange) {
  const start = rangeStart(range)
  return start === null ? sql`true` : sql`${localCreatedAt()} >= ${start}`
}

function orgJoin(orgId: string) {
  return and(eq(organizations.id, trustLedger.orgId), eq(organizations.id, orgId))
}

export interface TrustReportSummary {
  openingBalance: string
  totalIn: string
  totalOut: string
  closingBalance: string
}

// opening = as-corrected net strictly before the range; totalIn/totalOut =
// as-corrected in/out within it. Every as-corrected row falls on exactly one
// side of rangeStart, so one query (not two) covers the whole thing.
export async function getTrustReportSummary(
  orgId: string,
  range: TrustReportRange
): Promise<TrustReportSummary> {
  const rows = await db
    .select({
      direction: trustLedger.direction,
      amount: trustLedger.amount,
      before: sql<boolean>`${beforeRange(range)}`,
    })
    .from(trustLedger)
    .innerJoin(organizations, orgJoin(orgId))
    .where(asCorrected(orgId))

  let openingCents = 0
  let inCents = 0
  let outCents = 0
  for (const row of rows) {
    const cents = toCents(row.amount)
    if (row.before) {
      openingCents += row.direction === "in" ? cents : -cents
    } else if (row.direction === "in") {
      inCents += cents
    } else {
      outCents += cents
    }
  }
  return {
    openingBalance: centsToAmount(openingCents),
    totalIn: centsToAmount(inCents),
    totalOut: centsToAmount(outCents),
    closingBalance: centsToAmount(openingCents + inCents - outCents),
  }
}

export interface TrustReportSeriesPoint {
  bucket: string
  openingBalance: string
  totalIn: string
  totalOut: string
  closingBalance: string
}

// One point per bucket with activity, in order, each one's opening balance
// carried forward from the previous bucket's closing balance (starting from
// the range's own opening balance).
export async function getTrustReportSeries(
  orgId: string,
  range: TrustReportRange
): Promise<TrustReportSeriesPoint[]> {
  const granularity = RANGE_GRANULARITY[range]
  const rows = await db
    .select({
      // Cast to text: date_trunc returns a bare timestamp, and letting the pg
      // driver parse that back into a JS Date would reinterpret this org-local
      // wall clock through the process's own time zone.
      bucket: sql<string>`(date_trunc(${granularity}, ${localCreatedAt()}))::text`,
      direction: trustLedger.direction,
      amount: trustLedger.amount,
      before: sql<boolean>`${beforeRange(range)}`,
    })
    .from(trustLedger)
    .innerJoin(organizations, orgJoin(orgId))
    .where(asCorrected(orgId))

  let openingCents = 0
  const buckets = new Map<string, { inCents: number; outCents: number }>()
  for (const row of rows) {
    const cents = toCents(row.amount)
    if (row.before) {
      openingCents += row.direction === "in" ? cents : -cents
      continue
    }
    const bucket = buckets.get(row.bucket) ?? { inCents: 0, outCents: 0 }
    if (row.direction === "in") bucket.inCents += cents
    else bucket.outCents += cents
    buckets.set(row.bucket, bucket)
  }

  let runningCents = openingCents
  return [...buckets.keys()].sort().map((bucket) => {
    const { inCents, outCents } = buckets.get(bucket)!
    const openingBalance = centsToAmount(runningCents)
    runningCents += inCents - outCents
    return {
      bucket,
      openingBalance,
      totalIn: centsToAmount(inCents),
      totalOut: centsToAmount(outCents),
      closingBalance: centsToAmount(runningCents),
    }
  })
}

export interface TrustReportEntriesFilter {
  entryType?: TrustLedgerEntryType
  itemType?: InvoiceItemType
  carrierId?: string
  limit: number
  offset: number
}

export interface TrustReportEntry {
  id: string
  createdAt: Date
  entryType: TrustLedgerEntryType
  direction: TrustLedgerDirection
  amount: string
  note: string | null
  clientId: string
  clientName: string
  policyId: string
  policyNumber: string
  carrierId: string | null
  carrierName: string | null
  itemType: InvoiceItemType | null
}

export interface TrustReportEntriesPage {
  entries: TrustReportEntry[]
  total: number
  limit: number
  offset: number
}

// Newest first, as-corrected, scoped to the range. Joins in the display
// fields a reviewer needs (client name, policy number, carrier, item type)
// rather than making the frontend re-fetch each one.
export async function getTrustReportEntries(
  orgId: string,
  range: TrustReportRange,
  filter: TrustReportEntriesFilter
): Promise<TrustReportEntriesPage> {
  const conditions = [asCorrected(orgId), inRange(range)]
  if (filter.entryType) conditions.push(eq(trustLedger.entryType, filter.entryType))
  if (filter.itemType) conditions.push(eq(invoiceItems.type, filter.itemType))
  if (filter.carrierId) conditions.push(eq(trustLedger.carrierId, filter.carrierId))

  const rows = await db
    .select({
      id: trustLedger.id,
      createdAt: trustLedger.createdAt,
      entryType: trustLedger.entryType,
      direction: trustLedger.direction,
      amount: trustLedger.amount,
      note: trustLedger.note,
      clientId: trustLedger.clientId,
      clientName: sql<string>`${persons.firstName} || ' ' || ${persons.lastName}`,
      policyId: trustLedger.policyId,
      policyNumber: autoPolicies.policyNumber,
      carrierId: trustLedger.carrierId,
      carrierName: carriers.name,
      itemType: invoiceItems.type,
      // bigint by default, which node-postgres returns as a string; cast to
      // int32 so it comes back as a number (a page's row count never
      // approaches that range).
      total: sql<number>`(count(*) over ())::int`,
    })
    .from(trustLedger)
    .innerJoin(organizations, orgJoin(orgId))
    .innerJoin(clients, and(eq(clients.id, trustLedger.clientId), eq(clients.orgId, orgId)))
    .innerJoin(persons, and(eq(persons.id, clients.namedInsuredId), eq(persons.orgId, orgId)))
    .innerJoin(
      autoPolicies,
      and(eq(autoPolicies.id, trustLedger.policyId), eq(autoPolicies.orgId, orgId))
    )
    .leftJoin(carriers, and(eq(carriers.id, trustLedger.carrierId), eq(carriers.orgId, orgId)))
    .leftJoin(
      invoiceItems,
      and(eq(invoiceItems.id, trustLedger.invoiceItemId), eq(invoiceItems.orgId, orgId))
    )
    .where(and(...conditions))
    .orderBy(desc(trustLedger.createdAt), desc(trustLedger.id))
    .limit(filter.limit)
    .offset(filter.offset)

  const total = rows[0]?.total ?? 0
  return {
    entries: rows.map(({ total: _rowTotal, ...entry }) => entry),
    total,
    limit: filter.limit,
    offset: filter.offset,
  }
}
