---
issue: 130
status: in-progress
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
- Frontend conversion (`frontend/src/api/*.ts` id/FK types, `client-tabs-storage.ts`,
  the `Number(...)` call sites named in the plan, and story fixtures) —
  delegated to a subagent since it is a large, mechanical, compiler-driven
  sweep; see that agent's own commit(s)/diff for the file list. Filled in
  after it reports back.

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
- Everything else implemented as scoped; no other deviations yet.

## For the docs stage / reviewer

- The frontend conversion was done by a delegated subagent following the
  plan's Frontend section verbatim (types, `client-tabs-storage.ts`,
  `ClientDetail.tsx`, `policy-tabs.tsx`, `policy-activities.tsx`,
  `add-policy-dialog.tsx`, `send-correspondence-dialog.tsx`,
  `reminder-rule-form.tsx`, `invoice-receipt-dialog.tsx`, and story
  fixtures). Read its diff with the same scrutiny as the rest of this
  branch - it was not hand-reviewed line-by-line against every plan bullet
  before commit, only compiler/lint/build-verified.

## Checks run

Backend (this runner's own Postgres, per CLAUDE.md - `db:push` + `db:bootstrap`
run against it, bootstrap re-run once to confirm idempotency):

- `npm run typecheck` - pass
- `npm run lint` - pass
- `npm run format:check` - pass (after `npm run format`)
- `npx vitest run` - 34 files / 424 tests pass
- `npm run build` - pass

Frontend: pending the delegated agent's report; will fill in `lint`/`build`
(and `test`, since Chromium + Playwright's headless shell are available on
this runner) results once it returns.

## Docs

`docs/API.md` and `docs/multitenancy.md` were already updated during
implementation (Row ids convention/section, renumbered rollout order) and
read as accurate against the final diff. No further doc changes needed:
README.md's `db:push` description still holds (it's the same command with an
extra idempotent, invisible extensions step) and neither
AUTH_SESSIONS_EXPLAINED.md nor frontend-ui-design.md reference id format.
