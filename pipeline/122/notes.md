---
issue: 122
status: implemented
---
# Implementation notes — issue #122

## Implemented

Everything scoped in `pipeline/122/plan.md`:

- `backend/src/db/pools.ts` — `appDb`/`adminDb` pools split out of `index.ts`,
  `DB_POOL_MAX` added.
- `backend/src/db/context.ts` — `AsyncLocalStorage`-backed `runInOrg()`,
  `currentOrgId()`, and the `db` proxy.
- `backend/src/db/index.ts` — re-export barrel, all ~40 existing
  `import { db } from "../db"` call sites untouched.
- `backend/src/db/rls.ts` — enables/forces RLS and installs a
  `FOR ALL USING/WITH CHECK (org_id = current_setting('app.org_id', true))`
  policy on all 21 tenant tables, plus the `information_schema.columns`
  completeness guard. Wired into `db:push` after `roles.ts`.
- `backend/src/auth/middleware.ts` — `requireAuth` opens `runInOrg` around
  the rest of the request (see *Deviations* for how the commit is
  sequenced relative to the response).
- `backend/eslint.config.js` — `no-restricted-imports` blocks `adminDb`
  outside `src/db/**`, `src/jobs/**`, `testHelpers.ts`, and `*.test.ts`.
- `backend/src/routes/testHelpers.ts` — `TestContext.org()` and `cleanup()`
  moved to `adminDb`; every fixture builder wraps its repository call in
  `runInOrg`; `runInOrg` re-exported for tests to use directly.
- `backend/src/db/rls.test.ts` — proves an unfiltered query inside an org
  context can't see another org's row (while `adminDb` sees both), and that
  a tenant table returns zero rows with no org context set.
- `backend/src/routes/crossTenant.test.ts` — table-driven cross-tenant cases
  (list/detail/create-with-parent/exempt) for every org-scoped route, plus a
  completeness check that walks `app`'s registered routes and fails if one
  has no entry.
- The mechanical sweep: every test that called a repository or ran a raw
  `db` query outside a request now wraps that call in `runInOrg` —
  `repositories/{autoPolicies,persons,policyDrivers}.test.ts`,
  `emails.test.ts`, `jobs/reminders.test.ts`, `routes/{mail,
  emailTemplates,users,policyAttachments,policyLogAttachments}.test.ts`.
  `jobs/dispatcher.ts` itself was wrapped where it calls repositories
  directly (it stays on `adminDb` for its own queries, per plan).
- `docs/multitenancy.md` rewritten: *Request scoping*'s RLS bullet and
  *Rollout order* item 9 now describe the built system instead of the plan.
- `CLAUDE.md` gained a short "Multi-tenancy" section (orgId-first
  repositories, `adminDb` boundary, route work runs in the org context).

## Decisions

- **`organizations` is not RLS-protected**, per the plan's Risks section:
  it's grouped with `users`/`sessions`/`org_memberships` as an
  auth-layer-only table (`rls.ts`'s `AUTH_LAYER_TABLES`). `GET /auth/me`'s
  `findOrganizationById`/`listActiveMembershipsWithOrg` run under
  `requireSession`, before any org context exists, so a `SELECT`-only policy
  on `organizations` would 404 the org picker itself. Confirmed this doesn't
  regress anything: `crossTenant.test.ts` marks `/auth/me` and `/auth/org`
  `exempt` with that reasoning.
- **`FORCE ROW LEVEL SECURITY`'s superuser-owner assumption** is called out
  in `rls.ts`'s header comment rather than re-derived elsewhere; holds today
  because `DATABASE_ADMIN_URL` is the `postgres` superuser everywhere this
  repo runs.

## Deviations from plan

- **The request transaction commits before the response is flushed, not
  after.** The plan's step 3 (and its Risks section) specified committing
  on `res`'s `"close"` event, after the response was already on the wire,
  and explicitly accepted the resulting "client told about a write that
  didn't durably happen" risk as low-probability. In practice this was not
  low-probability: with every request now pinned to a real transaction,
  running the full suite repeatedly reproduced genuine cross-request
  failures — e.g. `POST /invoices/:id/void` wrongly succeeding because the
  `POST /payments` immediately before it (a separate request, per the test)
  hadn't committed yet when the void's active-payment check ran, so under
  READ COMMITTED it read its own prior write as missing. This isn't a test
  artifact — it's the same failure mode a real client hitting create-then-
  refetch would see. Fixed by intercepting `res.end` in `requireAuth`:
  the handler runs to completion and produces its response as normal, but
  the actual write to the socket is held until `runInOrg`'s transaction has
  returned (i.e. `COMMIT` has completed), then flushed. A commit failure now
  means nothing is ever sent to the client (connection times out) rather
  than a success response for a write that didn't land — strictly better
  than the plan's specified behavior, not just different. Confirmed with 9
  consecutive full-suite runs (476/476) after the fix, versus failures in
  most runs before it. `docs/multitenancy.md`'s *Request scoping* section
  and this file both describe the corrected sequencing; the plan's own
  Risks section is left as historical record of what was originally
  proposed.
- No other deviations. The `TestContext.org()`-to-`adminDb` move was framed
  in the plan around the (unadopted) `organizations`-SELECT-policy scenario;
  since that policy wasn't added, the move is justified purely as "org
  creation is inherently owner-side," which the plan review's minor nit
  already anticipated.

## For the docs stage / reviewer

- `docs/multitenancy.md` and `CLAUDE.md` are already updated as part of this
  branch (plan step 9); no further doc work should be needed, but please
  double check the *Request scoping* RLS bullet reads correctly given the
  commit-before-flush deviation above.
- Worth a close look in review: `backend/src/auth/middleware.ts`'s `res.end`
  interception. It assumes every route ends its response through
  `res.json`/`res.send`/`res.status().json()` (all of which fund into a
  single `res.end` call) rather than streaming via `res.write` — confirmed
  true today (`grep -rn "res.write\|res.pipe" src/routes` is empty) but
  worth re-checking if a future route streams a response (a large PDF or
  CSV export, say), since that would bypass the single-`res.end` assumption.
- Per plan, production's deploy path should be confirmed to run `db:push`
  before the new `app`-role code paths do (RLS must exist before it's relied
  on); this branch doesn't touch deploy config.

## Checks run

Against this runner's own isolated Postgres (`DATABASE_URL`/
`DATABASE_ADMIN_URL` already pointed at it in the environment):

- `npm run db:push` (includes `rls.ts`) and `npm run db:bootstrap` — both
  idempotent, run repeatedly during development.
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run format:check` — clean (ran `npm run format` once to fix 3 files
  the RLS sweep had touched without reformatting).
- `npm test` — 476/476 passing; run 9 times consecutively after the
  `res.end` fix with no failures (see *Deviations* above for the flakiness
  this fixed).
- `npm run build` — clean.
- Frontend untouched by this issue (backend-only per plan); no frontend
  checks run, matching the plan's Tests section.
