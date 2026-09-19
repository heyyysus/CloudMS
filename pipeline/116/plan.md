---
issue: 116
status: pending-review
---
# Multi-tenant 1/8: drop migrations, `db:push`, split DB roles, `bootstrap.ts`

## Goal

Schema management moves from generated migration files to `drizzle-kit push`, and the
application stops talking to Postgres as the owner. Done means:

- `backend/drizzle/` is gone from the repo, along with the `db:generate` / `db:migrate`
  scripts and every doc/CI/Dockerfile reference to them.
- `npm run db:push` brings a fresh, empty database to the current `schema.ts`
  non-interactively (never prompts, even for a destructive diff) and then creates/grants
  the `app` role; `npm run db:bootstrap` inserts the baseline rows.
- Two connection strings exist: `DATABASE_ADMIN_URL` (owner, used by push, roles, seed,
  bootstrap) and `DATABASE_URL` (the non-superuser `app` role, used by the API, the
  scheduler and the test suite). `backend/src/db/index.ts` exports `db` and `adminDb`.
- `npm test` passes in full while connected as `app`; `npm run db:seed` still works via
  `adminDb`; CI is green with push + roles + bootstrap in place of the migrator.
- **No schema change.** `schema.ts` is not edited by this issue.

## Scope check

This is step 8 of `docs/multitenancy.md`'s rollout order ("row-level security backstop")
being *prepared* ahead of time: RLS needs a non-superuser role that policies actually
apply to (a superuser bypasses RLS entirely), so the role split has to land before any
policy does. Dropping migrations in favour of `push` also removes the per-step backfill
migration ceremony from the seven sub-issues that follow, which is why #115 sequences this
first. It serves PROJECT.md direction item 2 (multi-tenancy) and touches no product
pillar directly.

Triage labels look right: `enhancement`, `agent`, `area:infra`. Everything here is
infrastructure — schema tooling, DB roles, Docker, CI, docs. Nothing user-facing, no
frontend.

## Files / areas

Delete:
- `backend/drizzle/` — `0000_*.sql` … `0003_*.sql`, `meta/`, `meta/_journal.json`.

Backend:
- `backend/package.json` — drop `db:generate`, `db:migrate`; add `db:push`,
  `db:bootstrap`; move `drizzle-kit` from `devDependencies` to `dependencies`
  (runtime needs it — see Approach step 5). `package-lock.json` updates with it.
- `backend/drizzle.config.ts` — read `DATABASE_ADMIN_URL`; drop `out`.
- `backend/src/db/index.ts` — export `db` (app pool) and `adminDb` (owner pool).
- `backend/src/db/roles.ts` — **new**, idempotent role + grants, runs on `adminDb`.
- `backend/src/db/migrate.ts` → `backend/src/db/bootstrap.ts` — same body minus the
  `migrate()` call, on `adminDb`.
- `backend/src/db/seed/{run,wipe,carriers,financials,households,policies,users}.ts` —
  whichever of these import `db` switch to `adminDb`.
- `backend/src/jobs/automationUser.ts` — comments at lines 6 and 22 name
  `src/db/migrate.ts`; retarget to `bootstrap.ts` / `npm run db:bootstrap`.
- `backend/src/db/roles.test.ts` — **new** (see Tests).
- `backend/.env.example` — both URLs + `APP_DB_PASSWORD`.
- `backend/Dockerfile` — drop `COPY drizzle`; add what `drizzle-kit push` needs at
  runtime; new CMD.

Infra / CI:
- `docker-compose.yml` — `app` gets `DATABASE_ADMIN_URL` (postgres) and a `DATABASE_URL`
  on the `app` role.
- `docker-compose.build.yml` — only if the Dockerfile gains a build target/arg; likely
  untouched.
- `.github/workflows/ci.yml` — `DATABASE_ADMIN_URL` in `env:`, `DATABASE_URL` on `app`;
  replace the `npx ts-node src/db/migrate.ts` step.
- `.github/workflows/agent-coder.yml` — same two changes in the `env:` block and the
  "Install and migrate" step.

Docs:
- `README.md` — Option A step 3, the scripts table (lines 63–64), and the "Before opening
  a PR" block (line 96).
- `CLAUDE.md` — the shared-database section (lines 41–60): `db:push` is *not* safe
  against the shared database; `db:bootstrap` is.
- `docs/AUTH_SESSIONS_EXPLAINED.md:299`, `frontend.md:15` — `db:migrate` → `db:bootstrap`.
- `docs/multitenancy.md` — one line under "Request scoping" noting the `app` role now
  exists and only the policies remain for step 8. Optional but cheap.

## Approach

1. **`src/db/index.ts` — two pools.** Keep the existing `drizzle(pool, { schema })`
   shape; add a second `Pool` on `process.env.DATABASE_ADMIN_URL` and export
   `adminDb = drizzle(adminPool, { schema: { ...schema, ...relations } })`. `pg.Pool`
   connects lazily, so exporting both costs nothing in a process that uses one. Comment
   why the split exists (RLS backstop later, least privilege now), pointing at
   `docs/multitenancy.md`.

2. **`src/db/roles.ts`.** Runs on `adminDb`, with `sql` from `drizzle-orm`, and
   `process.exit(0)` at the end like `migrate.ts` does today (open pools otherwise keep
   the process alive). Statements, all idempotent:
   - `DO $$ ... IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN CREATE
     ROLE app LOGIN PASSWORD ... END IF; END $$;` — there is no `CREATE ROLE IF NOT
     EXISTS`. Follow with an unconditional `ALTER ROLE app WITH LOGIN PASSWORD ...` so a
     changed `APP_DB_PASSWORD` takes effect on re-run. Password from
     `process.env.APP_DB_PASSWORD ?? "password"`.
   - `GRANT CONNECT ON DATABASE <current_database()> TO app`
   - `GRANT USAGE ON SCHEMA public TO app`
   - `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app`
   - `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app`
   - `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON
     TABLES TO app` and `... GRANT USAGE, SELECT ON SEQUENCES TO app`
   Two gotchas to get right: a role name and a password cannot be bound as parameters in
   DDL, so they must be interpolated — use `format('%I', ...)` / `quote_literal()` inside
   the `DO` block rather than string-concatenating into `sql.raw`. And default privileges
   attach to the *granting* role, so this must run on the same role the push runs as
   (both use `DATABASE_ADMIN_URL`; say so in a comment). No `CREATE`, no DDL, no RLS —
   sub-issue 7 owns policies.

3. **`db:push` and `db:bootstrap`.**
   - `drizzle.config.ts`: `url: process.env.DATABASE_ADMIN_URL!`; remove `out` so no
     `drizzle/` directory is recreated.
   - `"db:push": "drizzle-kit push --force && ts-node src/db/roles.ts"` — confirm the
     non-interactive flag with `npx drizzle-kit push --help` on the installed 0.31.x
     before settling on `--force`; the requirement is "never prompts", not the specific
     spelling.
   - Rename `src/db/migrate.ts` → `src/db/bootstrap.ts` with `git mv`, drop the
     `migrate()` import and call, switch `db` → `adminDb`, and update the header comment
     (it currently explains why migrations are safe against live data). The three
     insert-if-absent blocks and the `welcome` template `kind` backfill stay exactly as
     they are. `"db:bootstrap": "ts-node src/db/bootstrap.ts"`.
   - Drop `db:generate` / `db:migrate`; keep `db:studio` (it now reads the admin URL
     through the config).

4. **Seed on `adminDb`.** Every file under `src/db/seed/` that does
   `import { db } from "../index"` becomes `import { adminDb as db } from "../index"` —
   smallest diff, no call-site churn. `wipe.ts` included.

5. **Dockerfile.** Remove `COPY drizzle ./drizzle`. `drizzle-kit push` reads the schema
   from TypeScript source at run time, so the runtime stage needs `drizzle.config.ts` and
   `src/` (`schema.ts` imports only `drizzle-orm`, but copying all of `src` is robust and
   the builder stage already has it) plus `drizzle-kit` resolvable — moving it into
   `dependencies` makes `npm ci --omit=dev` in the `prod-deps` stage keep it. New CMD:

   ```
   CMD ["sh", "-c", "npx drizzle-kit push --force && node dist/db/roles.js && node dist/db/bootstrap.js && node dist/index.js"]
   ```

   (`roles.js`/`bootstrap.js` rather than `npm run db:push`, because there is no `ts-node`
   in the production image.) If moving `drizzle-kit` to `dependencies` proves unpalatable
   on image size, the alternative is a runtime `RUN npm i --no-save drizzle-kit@<pinned>`
   — pick one, don't do both.

6. **Compose.** `app.environment` gets
   `DATABASE_ADMIN_URL=postgresql://postgres:password@db:5432/myapp` and
   `DATABASE_URL=postgresql://app:password@db:5432/myapp`. Add a comment that the `app`
   password here and `APP_DB_PASSWORD` must be changed together, since nothing derives one
   from the other. `docker-compose.build.yml` needs no change unless step 5 adds a target.

7. **CI.** In `ci.yml`: `DATABASE_URL` → the `app` role, add `DATABASE_ADMIN_URL` on
   `postgres`, and replace the migrate step with `npm run db:push` then
   `npm run db:bootstrap`, rewriting the comment above it (it currently explains the
   migrator). Same treatment for `agent-coder.yml`'s `env:` block and its "Install and
   migrate" step (rename it "Install and set up database").

8. **Docs.** README Option A step 3 becomes `npm install` → `npm run db:push` →
   `npm run db:bootstrap`, and step 2 shows both URLs; the scripts table swaps
   `db:generate` for `db:push` / `db:bootstrap` and notes `db:studio` uses the admin URL;
   the pre-PR block replaces `npm run db:migrate`. CLAUDE.md's shared-database bullets
   need the sharpest edit: the old text says the migrator "is additive and idempotent, so
   it is safe to run" — `db:push` is **not**, it will apply destructive DDL to whatever
   database it points at, so the rule becomes *`db:bootstrap` is safe on the shared
   database; `db:push` only against your own*. Update the per-agent-database recipe to set
   both URLs and run `db:push` + `db:bootstrap`.

## Tests

- Rely on the existing suite as the primary proof: it must pass in full with
  `DATABASE_URL` on the `app` role. That is the acceptance criterion and it exercises
  every repository's SELECT/INSERT/UPDATE/DELETE plus `pg_try_advisory_xact_lock` in
  `src/jobs/reminders.test.ts` (advisory locks need no superuser).
- New `backend/src/db/roles.test.ts`, using `adminDb`/`db` directly (no `TestContext`
  fixtures needed — it creates no domain rows):
  - the app connection reports a non-superuser `current_user`
    (`select current_user, (select usesuper from pg_user where usename = current_user)`),
    with a failure message that points at `.env.example`. This is the check that catches a
    regression back to connecting as owner.
  - the app connection is denied DDL: `create table ...` through `db` rejects. Wrap in a
    transaction/`try` so nothing is left behind if privileges are ever wrong.
  - running the `roles.ts` grant block a second time is a no-op (idempotence).
  Open choice, flag in review: the non-superuser assertion will fail for a developer whose
  local `.env` still uses `postgres`. That is arguably the point (their setup is stale),
  but if the reviewer prefers, gate those two cases behind a skip when `current_user` is
  the owner.
- Manual verification before the PR, on a scratch database (never the shared one):
  1. `createdb` fresh → `npm run db:push` → `npm run db:bootstrap` → `npm test` green.
  2. On a database built by the *old* `drizzle/` migrations, `npm run db:push` should
     report no changes other than dropping the leftover `users.is_demo` column (see
     Risks). A drift larger than that means push and the migration history disagree and
     must be understood before merge.
  3. `npm run db:seed` against that scratch database still succeeds.
  4. `docker compose -f docker-compose.yml -f docker-compose.build.yml build app` and a
     container start, to confirm `drizzle-kit` and the schema source are present at
     runtime — this is the step most likely to be wrong and invisible until deploy.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build` as usual.
  No frontend change, so no frontend run.

## Touches backend

yes

## Risks / open questions

- **First production push drops `users.is_demo`.** `docs/multitenancy.md`'s History notes
  the column was applied to production by the reverted migration `0004` and is now
  unreferenced. `push --force` will drop it without prompting on the first deploy. That is
  the correct end state, but it is a destructive DDL statement against the production
  database on the deploy that merges this, and it should be called out in the PR body.
- **Push diffs may not match the migration history.** Generated migrations and a push diff
  can disagree on index names, defaults or enum details, so the first push against the
  production-shaped database may emit more DDL than expected. Verification step 2 above
  exists to surface that before merge; if the drift is non-trivial, stop and report rather
  than forcing it through.
- **No more migration history at all.** After this, `push` is the only path and there is
  no rollback artifact and no reviewable SQL in the diff — a schema change's blast radius
  is only visible by running push. That is the decision #115 made deliberately; naming it
  so the reviewer confirms it.
- **`drizzle-kit` in the production image.** Either a heavier prod dependency tree
  (drizzle-kit pulls esbuild) or an extra runtime install; and the image now carries TS
  source. Flagged for the reviewer's preference between the two options in step 5.
- **Password drift.** `APP_DB_PASSWORD` (consumed by `roles.ts`) and the password embedded
  in `DATABASE_URL` are independent strings in three places (`.env.example`,
  `docker-compose.yml`, both workflows). Wrong-but-plausible edits break auth at startup.
  Mitigated only by comments; deriving one from the other is out of scope here.
- **Ordering at container start.** `roles.ts` must run after `push` (grants on *all
  tables* only cover tables that exist) and before the app connects. The CMD chain does
  that, but a future restart where push fails leaves the chain stopped — which is the
  desired behaviour, not a bug.
- **Open:** does the deploy host's Postgres already have a role named `app` from anything
  else? If so `ALTER ROLE ... PASSWORD` silently repoints it. Worth a one-line check
  against production before merge.
- **Open:** confirm the exact non-interactive flag for `drizzle-kit push` on the installed
  0.31.x rather than trusting `--force` from memory.

## Out of scope

- Any change to `schema.ts` — no table, column, index or enum edits.
- RLS policies, `SET LOCAL app.org_id`, `FORCE ROW LEVEL SECURITY` (sub-issue 7).
- `organizations`, `org_id`, org-scoped repositories, `TestContext` per-org fixtures
  (sub-issues 2–4).
- Auth, session, or `requireAuth` changes.
- Retiring `ADMIN_EMAIL` — bootstrap keeps inserting that admin exactly as today
  (sub-issue 6 owns its removal).
- Frontend, `frontend.yml`, and nginx.
- Managed-Postgres migration, backups, or any change to `scripts/start.sh`.
