# Implementation notes — issue #102

## What was implemented

Two independent guardrails, exactly as scoped in `plan.md`:

1. **Body cap (all modes):** `express.json({ limit: "256kb" })` in `backend/src/app.ts`,
   plus a new branch in the shared error handler that maps any body-parser error carrying
   `status`/`statusCode` in the 4xx range to that status with the API's standard
   `{ error: <string> }` shape (413 → "Request body too large", any other 4xx →
   "Invalid request body"). Confirmed the plan's central claim before writing the fix: the
   413 test failed as a 500 against the unmodified error handler, then passed once the new
   branch was added.
2. **Row ceiling (demo mode only):** new `backend/src/middleware/demoRowCeiling.ts`, a
   middleware factory taking a `PgTable` and returning 429
   `{ error: "Demo row limit reached; data resets on the next reseed." }` once that table's
   row count reaches `demoMaxRowsPerTable()`. No-op (no query) when `demoMode()` is false.
   Mounted after `requireAuth` (and after `requireRole("admin")` on carriers) on all eight
   create routes the plan lists: persons, clients, vehicles, policies (`autoPolicies` table),
   policy-logs, invoices, payments, carriers.
3. Created `backend/src/config.ts` from scratch (didn't exist on `main`; `#98` is still
   unmerged) with `demoMode()`, `demoSessionTtlMs()` copied verbatim from
   `origin/agent/issue-98:backend/src/config.ts`, plus this issue's `demoMaxRowsPerTable()`.
   Same for `.env.example`: added `#98`'s `DEMO_MODE`/`DEMO_SESSION_TTL_MINUTES` block
   verbatim alongside this issue's `DEMO_MAX_ROWS_PER_TABLE=5000`, so whichever branch merges
   second gets a small, easily-resolved textual conflict rather than a missing module.

## Deviations from the plan

None. Followed the plan's approach, file list, and test strategy as written, including:
- Extending the error handler with a dedicated `HttpError` interface (`status?`/`statusCode?`)
  next to the existing `PgError` interface, rather than casting inline.
- Broadening the branch to all 4xx `err.status`/`err.statusCode` (not just `err.type ===
  "entity.too.large"`) — the plan's default choice; flagged in the PR description per the
  plan's "Risks" section since it also turns malformed-JSON responses from 500 into 400.
- Test brackets (`DEMO_MAX_ROWS_PER_TABLE=1` / `1_000_000`) instead of "current count + 1",
  per CLAUDE.md's concurrency rule — no global row-count assertions, safe under parallel runs.

## Checks run (backend/)

`npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` —
all green (392 tests passed, including the new 413 tests in `app.test.ts` and the three
`demoRowCeiling.test.ts` cases). No frontend changes, so frontend checks were not run.
`npx tsx src/db/migrate.ts` was not needed (no schema change).

## Notes for the PR / docs stage

- Both production-behavior changes called out in the plan apply and should stay in the PR
  description: (1) the 256kb body cap applies outside demo mode too; (2) a malformed (not
  just oversized) JSON body now responds 400 instead of 500.
- `#98` (`DEMO_MODE`) is still unmerged. `backend/src/app.ts` doesn't need it, but
  `backend/src/config.ts` and `.env.example` will very likely produce a small textual merge
  conflict with `#98` for whichever of the two PRs lands second — both conflicts are trivial
  (`config.ts`: keep both function bodies; `.env.example`: keep both env blocks).
- Per plan, child/bulk POSTs (`invoices.ts:88` `/void`, `payments.ts:89` `/void`) and tables
  written as a side effect of a covered create (drivers, policyDrivers, invoiceItems,
  receipts, trustLedger, clientPhones, clientEmails) are intentionally not directly ceilinged
  — they're bounded transitively by their parent create's ceiling.

## Docs

Updated `docs/API.md`'s Conventions status-code list: `400` now also covers unparsable JSON
bodies, and added the new global `413` (256kb body cap) and demo-only `429` (row ceiling)
codes. No other doc changes: no auth/session behavior changed, no UI, and README/`.env.example`
already document env vars there rather than in prose.
