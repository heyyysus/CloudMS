# Plan review — issue #116

## Findings

- Scope matches the issue exactly: schema tooling, DB roles, Docker/CI/docs — no
  `schema.ts` edits, no RLS, no `organizations`/`org_id`, no auth changes. The plan's own
  "Out of scope" section mirrors the issue's list line for line.
- Direction is consistent with `docs/multitenancy.md`: rollout step 8 (RLS backstop)
  requires a non-superuser role for policies to apply to, and the plan correctly frames
  this issue as preparing that role ahead of schedule, without touching RLS itself
  (`docs/multitenancy.md:71-74`, plan's "Scope check").
- File list is accurate and reuses existing patterns. Verified directly:
  - `backend/src/db/index.ts` today is exactly the single-pool shape the plan says to
    extend with a second `adminDb` pool.
  - `backend/src/db/migrate.ts` matches the described body (migrate() call, admin
    insert-if-absent, automation user, welcome template + `kind` backfill) that the plan
    says to keep verbatim in `bootstrap.ts` minus the migrate() call.
  - `backend/src/db/seed/{run,wipe,carriers,financials,households,policies,users}.ts` all
    do `import { db } from "../index"` today, confirming the plan's "whichever of these
    import db" file list is exactly these seven (not `rng.ts`, which imports nothing from
    `../index`).
  - `backend/src/jobs/automationUser.ts:6,22` do reference `src/db/migrate.ts` as the plan
    states.
  - `backend/Dockerfile` confirms the current `COPY drizzle ./drizzle` and single-stage
    final image with only `dist` copied in — the plan's observation that the runtime image
    needs `drizzle.config.ts` + `src/` added for `drizzle-kit push` to work is a real gap,
    correctly identified rather than assumed.
  - `.github/workflows/ci.yml` confirms the current migrate step and env block the plan
    says to replace.
  - `CLAUDE.md:41` currently says the migrator "is additive and idempotent, so it is safe
    to run" — the plan's step 8 correctly flags this must become "`db:bootstrap` is safe;
    `db:push` is not," which is a real and necessary correction to a safety-relevant doc.
  - `backend/src/db/wipe.ts` only issues `DELETE`s, consistent with the plan's `app`-role
    grants (SELECT/INSERT/UPDATE/DELETE, no DDL) being sufficient for both the app and the
    seed's wipe step (seed itself moves to `adminDb`, but even without that this file's
    statements wouldn't have required elevated privilege).
- Security posture is sound and is in fact the point of the issue: moving the API and test
  suite off the superuser role, least-privilege grants (no DDL, no superuser bit), and
  explicit interpolation guidance for the role name/password in the `DO $$` block
  (`format('%I', ...)`/`quote_literal()` instead of raw string concatenation) heads off SQL
  injection into the role-creation DDL. No secrets are hardcoded — `APP_DB_PASSWORD`
  defaults to `"password"` only for dev, matching the existing convention in
  `docker-compose.yml`/`.env.example` for the `postgres` role today.
- Tests are adequate for infra-only scope: the existing suite is the acceptance gate
  (running as `app` catches any missed grant), plus a new `roles.test.ts` that asserts
  non-superuser `current_user`, that DDL is denied, and that the grant script is
  idempotent. Per CLAUDE.md, backend tests should use `TestContext`; the plan correctly
  argues `roles.test.ts` doesn't need it since it creates no domain rows and instead
  exercises the connection/role itself — a reasonable exception, not a violation.
- The plan is honest about real open risks (production `users.is_demo` column dropped by
  first push, push-vs-migration-history drift, unverified `drizzle-kit push` non-interactive
  flag, potential pre-existing `app` role on the deploy host) rather than hiding them, and
  schedules manual verification steps to catch each before merge. None of these rise to
  "plan is unsound" — they're correctly surfaced as reviewer-facing calls, not silently
  assumed.
- Minor, non-blocking: the plan's CI comment rewrite doesn't mention that `ci.yml`'s
  existing comment ("Runs the same migrator + bootstrap ... as the production container's
  dist/db/migrate.js") will need its filename reference updated too
  (`.github/workflows/ci.yml:56-58`) — implied by "rewriting the comment above it" but worth
  the coder double-checking both workflow files' comments, not just the command line.

## Required changes (if rejected)

N/A

Verdict: approved
