---
issue: 130
status: complete
---
# Implementation notes — issue #130

## Implemented

Picked up from a prior attempt that had already landed (backend-only, up to
commit `780a08a`):

- `backend/src/db/ids.ts` / `ids.test.ts` — `generateRowId()`, `ROW_ID_PATTERN`,
  `ROW_ID_DEFAULT_SQL`, `rowIdPk()`/`rowIdFk()`.
- `backend/src/db/extensions.ts` — `pgcrypto` + `pg_trgm`, wired into
  `db:push` and the Dockerfile CMD.
- `backend/src/db/schema.ts` — every table's id/FK columns converted to
  `varchar(22)`; the 21 tenant tables' `org_id` dropped `.notNull().default(1)`
  in favor of plain nullable, with the FK kept and comments pointing at #121.
- Repositories, `bootstrap.ts`, seed scripts, routes, jobs, auth, emails,
  accounting-log/document code, and `backend/src/types/index.ts` converted
  `number` id params/fields to `string`; `routes/helpers.ts`'s `parseId` now
  404s on a pattern mismatch instead of 400ing; ordering fixes applied at the
  six `desc(id)`/`orderBy(users.id)` sites named in the plan.
- `backend/src/routes/testHelpers.ts` and the 33 `*.test.ts` files converted
  to string ids, with `MISSING_ROW_ID` replacing literal nonexistent-id
  constants.

This session's own work:

- `backend/src/routes/testHelpers.ts` formatting fix (`npm run format`) to
  clear `format:check` — the prior wip commit had unformatted diffs.
- `backend/src/routes/testHelpers.ts` `cleanup()` — sweep `email_templates`
  by `orgId` before deleting `organizations` (see Deviations).
- `backend/src/repositories/emailTemplates.ts` `upsertEmailTemplate()` — set
  `kind: "welcome"` explicitly on insert (see Deviations).
- `docs/API.md` — added a **Row ids** bullet under Conventions (format +
  404-not-400 rule), `personId: number` → `string` in the policies POST/PATCH
  body docs, and reworded the `policy-log-attachments` "positive integers"
  aside since `attachmentIds` are now row ids, not integers.
- `docs/multitenancy.md` — added a **Row ids** subsection under *Data model*
  (format, dual generation, why flat random over `<org>-<seq>`, org_id
  nullable until #121), updated the stale `org_id NOT NULL` / "temporary
  default of 1" language in *Data model* and *Request scoping* to match the
  dropped default, renumbered the sub-issue references to issue numbers
  (#119/#120/#121/#122), and inserted a **Rollout order** step for #130
  before the repository-scoping step (renumbering the rest).
- Frontend conversion — `frontend/src/api/*.ts` id/FK types only. **The rest of
  the frontend was delegated to a subagent whose work never landed**, so the
  branch was pushed and the PR opened with the API layer typed `string` and
  every consumer still typed `number`. That is what made the Frontend check
  red on #131 (431 `tsc` errors across 68 files). Completed in a follow-up
  session; see below.

Follow-up session (after PR #131's Frontend check failed):

- **Shipping source** (27 files): id annotations, id-typed `useState`,
  `Set<number>`/`Map<number, …>` keys, and `Number(...)` coercions on ids.
  Coercions on genuinely numeric values (`Number(term)`, `Number(vehicle.year)`,
  `Number(item.amount)`) were left alone.
- **Story and test fixtures** (49 files): numeric id literals quoted as the
  same digits (`id: 2` → `id: '2'`) so fixtures that cross-reference each
  other keep pointing at the same row.
- Three things the compiler alone would not have caught — see *Deviations*.

## Decisions

- Kept the plan's separation of row-level `:id` (404) vs list-filter query
  params (400) — no reviewer objection raised in review.md, so not
  unifying it.
- Did not attempt a production migration path for existing data (Risk #1 in
  the plan) - out of scope per the plan's own stated assumption, and this
  runner's database is disposable.

## Deviations from plan

- **`TestContext.cleanup()` needed an extra sweep the plan didn't call out.**
  `upsertEmailTemplate` (the `/email-templates/:key` PUT route) mints an
  `email_templates` row scoped to `req.orgId`, without going through the
  context's `template()` fixture method - so it was never in `templateIds`.
  Once `org_id`'s `DEFAULT 1` was dropped (making per-test orgs the only org
  that route's writes could land in), this row started blocking
  `cleanup()`'s `organizations` delete with a live FK. Fixed by having
  `cleanup()` delete `email_templates` by `orgId` (in addition to the
  existing `templateIds` sweep) right before deleting `organizations`.
- **`upsertEmailTemplate` had a latent kind bug, exposed by the same default
  removal.** Its `insert().values(input)` never set `kind`, relying on the
  schema's `default("correspondence")`. Under the old shared `org_id DEFAULT
  1`, every test's PUT of the welcome template hit the *update* half of
  `onConflictDoUpdate` (the row already existed in org 1 from bootstrap, and
  `set` doesn't touch `kind`), so the wrong default was never reached. With
  distinct per-test orgs now the norm, the PUT route's first call for a given
  org takes the *insert* path and would create a `kind: "correspondence"`
  row for a `key: "welcome"` template - which then leaked into
  `correspondenceTemplates`' kind-scoped listing (a test caught this: "never
  lists the welcome template (kind-scoped)"). Fixed by passing
  `kind: "welcome"` explicitly on insert; `upsertEmailTemplate`'s only caller
  is the welcome-template route, so this isn't a widening of the function's
  contract.
- **Two runtime guards still tested `typeof x === 'number'`.** Type-only
  conversion left both intact, and neither is a type error:
  `lib/client-tabs-storage.ts`'s `isClientTab` made `loadTabs()` drop every
  saved tab and return `[]` (the storybook test caught it, `tsc` did not);
  `components/admin/invite-user-form.tsx`'s 409 handler made the
  restore-a-deleted-user flow silently never fire. Flipping the tabs guard
  also means stale numeric tabs from before this change self-purge on next
  load, so no storage migration is needed. `lib/money.ts`'s
  `typeof amount === 'number'` is a genuine amount and was left alone.
- **Two frontend sorts used `a.id - b.id` as a tiebreak** (`lib/policy-status.ts`,
  `lib/policy-ledger.ts`). Arithmetic on an opaque id is meaningless, so both
  now `localeCompare`. The tiebreak stays stable but is no longer
  creation-ordered; `createdAt` carries chronology. This is the frontend twin
  of the backend `desc(id)` fixes the plan named, which it did not extend to
  `frontend/`.
- **`ClientDetail.tsx` derived its route param via `Number(params.clientId)`**
  guarded by `Number.isFinite`. Replaced with the raw param and an empty
  check; a malformed-but-present id now reaches the API and returns 404,
  which the existing effect already handles.
- **Backend test files carried stale numeric ids invisible to CI** (the PR
  review listed six). `tsconfig.json` excludes `src/**/*.test.ts` from
  typecheck, so none of them failed anything — the same gap that let the
  stale `emails.test.ts` call sites through in #129. Verified with a
  temporary tests-inclusive tsconfig (not committed): 153 errors before,
  5 after, those 5 being the documented pre-existing ones unrelated to ids.
- Everything else implemented as scoped.

## For the docs stage / reviewer

- **Correcting this section's earlier claim:** it previously said the frontend
  conversion had been done by a delegated subagent and was
  "compiler/lint/build-verified". Neither was true - the subagent's work never
  landed on the branch, and the PR was opened with the frontend unconverted
  and its build broken. The conversion described above was done by hand in a
  follow-up session and verified by actually running the checks.
- The two runtime `typeof === 'number'` guards are the part worth a reviewer's
  attention: they are invisible to `tsc` and were only caught by the browser
  test run. If any similar guard exists on a path without story coverage, it
  would still be latent. `grep -rn "=== 'number'"` over `frontend/src` now
  returns only `lib/money.ts`, which is correct.
- The backend suite was **not** run in the follow-up session - that
  environment had no database or `.env` - so CI is the first real execution of
  the backend test-file changes. They are confined to type annotations,
  fixture literals, array types and two call-site values, but they are
  unexecuted.

## Checks run

Backend (this runner's own Postgres, per CLAUDE.md - `db:push` + `db:bootstrap`
run against it, bootstrap re-run once to confirm idempotency):

- `npm run typecheck` - pass
- `npm run lint` - pass
- `npm run format:check` - pass (after `npm run format`)
- `npx vitest run` - 34 files / 424 tests pass
- `npm run build` - pass

Frontend (follow-up session — all three steps `frontend.yml` runs):

- `npm run lint` — pass (exit 0; only pre-existing `only-export-components`
  warnings, none introduced here)
- `npm test` — 58 files / 329 tests pass, in Chromium via the storybook
  interaction runner
- `npm run build` — pass (`tsc -b` clean: 431 errors → 0)

Backend (follow-up session): `typecheck`, `lint`, `format:check` and `build`
all pass. `vitest` was **not** run — no database or `.env` in that
environment — so CI is the first execution of the backend test-file changes.

## Docs

`docs/API.md` and `docs/multitenancy.md` were already updated during
implementation (Row ids convention/section, renumbered rollout order) and
read as accurate against the final diff. No further doc changes needed:
README.md's `db:push` description still holds (it's the same command with an
extra idempotent, invisible extensions step) and neither
AUTH_SESSIONS_EXPLAINED.md nor frontend-ui-design.md reference id format.
