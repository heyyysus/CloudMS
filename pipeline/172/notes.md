# Implementation notes — issue #172

## Implemented

- `repositories/trustLedger.ts`: `getTrustReportSummary`, `getTrustReportSeries`,
  `getTrustReportEntries`, plus the shared `asCorrected` predicate and the
  local-timezone bucketing helpers.
- `routes/trustReport.ts`: `GET /trust-report/{summary,series,entries}`, admin-only,
  mounted in `app.ts`.
- `routes/schemas.ts`: `paginationQuery`, `trustRangeQuery`, `trustReportEntriesQuery`.
- Tests: `routes/trustReport.test.ts` (6 cases) and three new `crossTenant.test.ts`
  `ENTRIES` rows with cross-org assertions.
- `docs/API.md`: new "Trust reporting" section under "Trust ledger".

## Decisions

- `getTrustReportSummary`/`Series` fetch every as-corrected row for the org (not just
  the range) and split opening-vs-in-range in JS, since "opening" needs full history
  anyway and every row falls on exactly one side of `rangeStart`. Fine at this table's
  current size; revisit if a single org's ledger grows large enough for this to matter.
- Series buckets are Postgres-formatted local timestamps cast to text (`YYYY-MM-DD
  HH:MI:SS`), not JS `Date` — letting `pg` parse a bucket back into a `Date` would
  reinterpret the org-local wall clock through the process's own time zone.

## Deviations

None.

## For the docs stage / reviewer

- The open question in plan.md (`date_trunc('week')` starting Monday) was left as
  Postgres's default; no test pins the boundary.
- `getTrustBalanceByClientId` vs. as-corrected equality is pinned by a test with one
  reversed pair, per the plan's flagged risk.

## Checks run

| Command | Result |
|---|---|
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run format:check` | pass |
| `npm test` | pass (522/522) |
| `npm run build` | pass |

Frontend untouched, so no frontend checks run.

## Docs

`docs/API.md`'s "Trust reporting" section (already added in the implementation
commit) fully covers the three endpoints — no further doc changes needed.
README, auth/session, and frontend-UI docs are unaffected: backend-only,
admin-scoped, no new UI or setup steps.
