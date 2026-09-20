# Plan review — issue #130

## Findings

- Scope matches the issue precisely: every table converted to `varchar(22)`, `org_id .default(1)` dropped (not backfilled), ordering-by-id sites fixed, `bootstrap.ts` moved to slug-keyed dedup, routes 404 on malformed ids, frontend types flipped to `string`. Nothing from #119–#123 (org-scoping, invoice numbering, RLS, org picker) is pulled forward. No scope creep found.
- Direction is consistent with `PROJECT.md` item 2 and `docs/multitenancy.md`'s rollout order — this sits before rollout step 3's repository half (still open per multitenancy.md's own "Not done yet (sub-issues 4-6)" note), and the plan does not touch org-scoping, which correctly stays out of scope here.
- Spot-checked the plan's file/line claims against the current tree and every one matched exactly: `schema.ts` (`serial("id").primaryKey()` + the `org_id ... .default(1)` comment on all 21 tenant tables), `bootstrap.ts` (explicit `id: 1`, `setval` block, `DEFAULT_ORG_ID`), `routes/helpers.ts:7-14` (`parseId` currently 400s), `routes/schemas.ts:32` (`idParam = z.coerce.number()...`), the six `desc(id)`/`orderBy(users.id)` ordering sites in `invoices.ts`, `receipts.ts`, `payments.ts`, `trustLedger.ts`, `scheduledEmails.ts`, `orgMemberships.ts`, `client-tabs-storage.ts`'s `typeof ... === 'number'` guard, the `Number(...)` conversions in `ClientDetail.tsx`/`policy-activities.tsx`, and `accountingDocuments.ts:24`'s `formatDocumentNumber(id: number)`. This is unusually well-grounded for a plan of this size.
- The id-generation approach (Postgres `DEFAULT` via pgcrypto + Drizzle `$defaultFn`, belt-and-braces) is sound and the base64/base64url math checks out: `translate(encode(gen_random_bytes(16),'base64'),'+/=','-_')` produces 22 chars (24-char padded base64 minus 2 stripped `=`), matching Node's `randomBytes(16).toString("base64url")`. Two real open questions (drizzle `.default()`/`$defaultFn()` coexistence, pgcrypto availability) are correctly flagged as risks with concrete fallbacks rather than silently assumed.
- Security: preserves the issue's core decision (cross-org row lookups stay 404, not 403) and closes the sequential-id volume-leak this issue exists for. No new exposure introduced — the "route param validation → 404" change is applied consistently, and the plan explicitly separates row-level `:id` (404) from list-filter query params (kept 400, correctly reasoned since a list returns `[]` either way and isn't presence-revealing).
- Tests are adequate and correctly scoped to `TestContext`/vitest: id-format unit tests, a raw-SQL DB-default test, `$defaultFn` coverage, 404 route-param tests (including the "no 400 leaks" check), ordering regression tests that avoid the intra-transaction same-`createdAt` trap, and bootstrap idempotency. This is more thorough than the issue's acceptance criteria require.
- CLAUDE.md conventions are respected: `db:push`/seed only run against the runner's own database, `db:bootstrap` stays insert-if-absent, no truncation, cleanup used instead.
- Minor inaccuracy, not material: the plan says "the eight private `…Ids: number[]` arrays" in `testHelpers.ts`; there are actually nine (`userIds`, `personIds`, `clientIds`, `carrierIds`, `policyIds`, `vehicleIds`, `templateIds`, `ruleIds`, `orgIds`). Irrelevant to correctness since the conversion is compiler-driven, not count-driven.
- The no-migration-path risk (item 1) is honestly surfaced rather than hidden — production-data survival is explicitly named as an assumption/open question rather than silently ignored, which is the right call for a plan-review gate rather than a deploy gate.

## Required changes (if rejected)

N/A

Verdict: approved
