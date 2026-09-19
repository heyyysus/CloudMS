---
issue: 116
status: in-progress
---
# Implementation notes — issue #116

## Implemented

- `backend/src/db/index.ts`: added a second `Pool`/`drizzle()` on
  `DATABASE_ADMIN_URL`, exported as `adminDb` alongside the existing `db`.
- `backend/drizzle.config.ts`: reads `DATABASE_ADMIN_URL`, dropped `out`.
- `backend/src/db/roles.ts` (new): idempotent `app` role create/grant, run on
  `adminDb` inside a transaction (see Decisions).
- `backend/package.json`: dropped `db:generate`/`db:migrate`, added
  `db:push` (`drizzle-kit push --force && ts-node src/db/roles.ts`) and
  `db:bootstrap` (`ts-node src/db/bootstrap.ts`); moved `drizzle-kit` from
  `devDependencies` to `dependencies`. `package-lock.json` regenerated.
- `backend/src/db/migrate.ts` → `backend/src/db/bootstrap.ts` (`git mv`):
  dropped the `migrate()` call/import, switched to `adminDb`.
- `backend/src/db/seed/{carriers,financials,households,policies,run,users,wipe}.ts`:
  `import { db }` → `import { adminDb as db }`.
- `backend/src/jobs/automationUser.ts`: comments retargeted from
  `src/db/migrate.ts` to `bootstrap.ts`/`db:bootstrap`.
- `backend/.env.example`: `DATABASE_ADMIN_URL`, `DATABASE_URL` (now the `app`
  role), `APP_DB_PASSWORD`.
- `backend/Dockerfile`: drop `COPY drizzle`, copy `drizzle.config.ts` + `src`
  instead; new CMD runs `drizzle-kit push --force && roles.js &&
  bootstrap.js && index.js`.
- `docker-compose.yml`: `app` service gets `DATABASE_ADMIN_URL` (postgres) and
  `DATABASE_URL` (app role), with a comment tying the app password here to
  `APP_DB_PASSWORD`.
- `backend/drizzle/` deleted (`0000`–`0003` migrations + `meta/`).
- `backend/src/db/roles.test.ts` (new): current_user is non-superuser, DDL is
  denied through `db`, grants are idempotent (see Tests below for what's
  covered).
- Docs: README.md (Option A steps 2–3, scripts table, pre-PR block),
  CLAUDE.md (shared-database section), `docs/AUTH_SESSIONS_EXPLAINED.md:299`,
  `docs/multitenancy.md` (one line under "Request scoping").

## Decisions

- **Role/password interpolation in `roles.ts`.** Postgres has no `CREATE ROLE
  ... IF NOT EXISTS`, and a role name/password can't be bound as a query
  parameter inside DDL or inside a `DO $$ ... $$` body (dollar-quoted text
  isn't parsed for `$1` placeholders). Used the pattern: pass the password to
  Postgres once as an ordinary parameterized value via `set_config`, then
  read it back and quote it server-side with `format('%L', current_setting
  (...))` wherever DDL needs it. All of this runs inside one
  `adminDb.transaction(...)` because a GUC set via `SET`/`set_config` is
  session-scoped and `pg.Pool` can hand different queries to different
  connections — a transaction pins everything to one client.
- `docker-compose.build.yml` needed no change (Dockerfile didn't gain a
  build target/arg).

## Deviations

- **Could not push `.github/workflows/ci.yml` / `agent-coder.yml` changes.**
  The coder's GitHub App token lacks the `workflows` permission scope, so
  `git push` is rejected outright for any commit touching a file under
  `.github/workflows/`: "refusing to allow a GitHub App to create or update
  workflow `<file>` without `workflows` permission." Verified this blocks
  each file individually, not just together. The intended diff (env block:
  `DATABASE_URL` → app role + new `DATABASE_ADMIN_URL`; migrate step →
  `npm run db:push && npm run db:bootstrap`, with comments updated) is saved
  as `pipeline/116/workflow-changes.patch` and NOT applied to the actual
  workflow files in this branch — apply it with `git apply
  pipeline/116/workflow-changes.patch` from a context that has `workflows`
  permission (a human, or the PR/merge stage if it uses a token with that
  scope) before merging. **Until that patch is applied, CI on this branch
  will fail**: `ci.yml` still runs `npx ts-node src/db/migrate.ts`, which no
  longer exists (renamed to `bootstrap.ts`), and doesn't set
  `DATABASE_ADMIN_URL` at all.

## For the docs stage / reviewer

- Apply `pipeline/116/workflow-changes.patch` before merge (see Deviations).
  Without it, CI's backend job fails on `npx ts-node src/db/migrate.ts`
  (file no longer exists) and has no `DATABASE_ADMIN_URL` for `db:push`/
  `db:bootstrap` to use.
- Confirmed `npx drizzle-kit push --help` on the installed 0.31.10:
  `--force` = "Auto-approve all data loss statements"; default `--strict` is
  `false`, so a plain `push --force` doesn't prompt at all in this version —
  matches the plan's "never prompts" requirement.
- Manual verification (scratch DB, this runner's own isolated Postgres, not
  shared): `createdb` → `db:push` → `db:bootstrap` → `npm test` all green as
  the `app` role. Ran a second `db:push`/`roles.ts` pass to confirm
  idempotence. See Checks run for exact commands/output status.
- Did not attempt the Docker build/run verification step from plan.md's Tests
  section (no Docker available on this runner) — Dockerfile changes are
  reviewed by inspection only. Flagging this as unverified.
- `users.is_demo` drop: not applicable here since there's no pre-existing
  migration-built production-shaped database on this runner to diff against;
  this risk from plan.md still applies at the real production deploy and is
  unchanged by anything in this implementation.

## Checks run
