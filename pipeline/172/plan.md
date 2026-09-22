---
issue: 172
status: pending-review
---
# Trust reporting: org-wide, date-ranged, bucketed reads

## Goal

Three admin-only endpoints — `GET /trust-report/summary`, `/series`, `/entries` — answer
`?range=this-month|last-3-months|ytd|all-time` across the whole org, bucketed in the org's
`reminder_timezone`, with reversals and the rows they reverse excluded. `entries` paginates.
`docs/API.md` covers all three. No schema change.

## Scope check

Roadmap item 2 (multitenancy): the read side of the existing trust model, org-scoped like every
other repository. Labels look right; `risk:high` fits — money totals plus a pagination shape the
rest of the API will copy. Orchestrator hold stands: extend #162's `crossTenant.test.ts` cases,
never replace them.

## Files / areas

| path | change |
|---|---|
| `backend/src/repositories/trustLedger.ts` | add `getTrustReportSummary` / `Series` / `Entries` |
| `backend/src/repositories/index.ts` | export them |
| `backend/src/routes/trustReport.ts` | new router, three GETs |
| `backend/src/app.ts` | mount `trustReportRouter` |
| `backend/src/routes/schemas.ts` | `paginationQuery`, `trustRangeQuery`, entries filters |
| `backend/src/routes/trustReport.test.ts` | new |
| `backend/src/routes/crossTenant.test.ts` | three `ENTRIES` rows + cross-org cases |
| `docs/API.md` | the three routes, under "Trust ledger" (~line 694) |

## Approach

1. `schemas.ts`: `paginationQuery` = `limit` (`coerce.number().int().min(1).max(200).default(50)`)
   + `offset` (`min(0).default(0)`) — the reusable shape; `trustRangeQuery` for the range enum;
   optional `entryType`, `itemType`, `carrierId`.
2. `trustLedger.ts`: one shared as-corrected predicate — `reversalOfId is null` **and** `id not in
   (select reversal_of_id ... where not null)` — always `and`-ed with `eq(trustLedger.orgId, orgId)`.
3. Same file: join `organizations` for `reminder_timezone`; bucket with
   `date_trunc(<granularity>, created_at at time zone 'UTC' at time zone o.reminder_timezone)`,
   the `planner.ts:46` idiom. Granularity: day / week / month / month. `all-time` has no lower bound.
4. `getTrustReportSummary`: opening = as-corrected net strictly before `rangeStart`; `totalIn` /
   `totalOut` summed in range via `toCents`/`centsToAmount` (`money.ts`); closing = opening + in − out.
5. `getTrustReportSeries`: group by bucket, then run the balance forward from `openingBalance`.
6. `getTrustReportEntries`: left-join clients/persons, `autoPolicies`, `carriers`, `invoiceItems`
   for name / policy number / carrier / type; `count(*) over ()` for `total`; `order by created_at
   desc, id desc`.
7. `trustReport.ts`: each route `requireAuth, requireRole("admin")`, `safeParse` the query, 400 via
   `firstIssue` on failure.

## Tests

- `trustReport.test.ts` (vitest, `TestContext`): org with `reminderTimezone: "America/Chicago"`,
  ledger rows inserted at explicit `createdAt` through `ctx.track`. Cases: 19:00 CT on a month's
  last day buckets into that month; a voided payment and its reversal appear in none of the three;
  `all-time` `closingBalance` equals the sum of `getTrustBalanceByClientId` under `runInOrg`;
  non-admin 403; `limit=500` clamps or 400s.
- `crossTenant.test.ts`: three `kind: "list"` `ENTRIES` rows (the registered-route check fails
  without them) plus org-A-cookie-sees-no-org-B-rows assertions added beside #162's.
- `npx vitest run`, `npm run lint`, `npx tsc --noEmit`.

## Touches backend

yes

## Risks / open questions

- `getTrustBalanceByClientId` nets reversals in; as-corrected drops both rows. Equal only because a
  reversal pair cancels — the acceptance test pins it.
- `date_trunc('week')` starts Monday. Confirm that is the wanted week boundary.
- Conflicts with PR #168 in `schemas.ts`, `crossTenant.test.ts`, `docs/API.md`.

## Out of scope

`/trust-ledger`, `/trust-balance`, `frontend/src/pages/TrustAccounting.tsx`, schema changes,
custom date ranges.
