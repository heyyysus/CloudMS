# Implementation notes — issue #101

## Resuming a failed pipeline run

The original `agent/issue-101` coder run failed on this branch (see the
issue's "Coder failed" comment): the working directory held a full
implementation but the runner exited with uncommitted changes still present,
so none of it survived — the pushed branch had only the plan/review docs plus
the merged foundation commits. This implementation was written fresh against
current `main` (which already includes #98 foundation, #99's revert, #100
frontend demo banner, and #102 guardrails — all merged since the plan was
approved), following `plan.md` as approved with no scope changes beyond
adapting to code that had moved on since the plan was written (see
Deviations).

## What was implemented

- `backend/src/jobs/config.ts` — `demoReseedConfig()`, using the file's
  existing `num()` helper. Falls back to the 15-minute default on a
  non-positive value (`DEMO_RESEED_INTERVAL_MINUTES=0`), not just on NaN —
  `num()` alone doesn't guard against a zero-delay hot loop.
- `backend/src/db/seed/rng.ts` — `resetRng()`, re-applies `faker.seed(42)` so
  a second `seed()` call in the same process regenerates the same
  reproducible dataset instead of continuing the faker stream.
- `backend/src/db/seed/wipe.ts` — `wipe(options: { preserveDemoUsers? })`.
  Default behavior (`npm run db:seed`) is byte-for-byte unchanged. With
  `preserveDemoUsers: true`: skips the unconditional session delete, nulls
  `deleted_by` on demo users first (self-FK, no `onDelete` action, would
  otherwise abort the delete), then deletes only `users where is_demo =
  false` — their sessions cascade away, demo sessions survive untouched.
- `backend/src/db/seed/run.ts` — `seed()` now takes a `SeedOptions` (=
  `WipeOptions`) bag, calls `resetRng()` on every invocation, and **returns**
  the row-counts object instead of `console.table`-ing it.
- `backend/src/db/seed.ts` (CLI entry) — prints the counts `seed()` now
  returns, so `npm run db:seed`'s console output is unchanged.
- `backend/src/db/bootstrap.ts` (new) — `ensureBootstrapRows()`, the
  admin/automation-user/`welcome`-template insert-if-absent blocks extracted
  verbatim from `migrate.ts`. Called from `migrate.ts` (behavior there is
  unchanged) and from the reseed job after every `seed()` call, since a
  demo wipe deletes both bootstrap users along with everything else that
  isn't a demo user.
- `backend/src/jobs/demoReseed.ts` (new) — `runDemoReseed()` (the guarded
  tick body, injectable seed function for testing) and
  `startDemoReseedScheduler()`, modeled directly on `jobs/scheduler.ts`:
  same `running` overlap guard, same `unref()`'d `setInterval`, refuses to
  start when demo mode is off or `NODE_ENV=test`. After each `seed()` call it
  also calls `ensureBootstrapRows()` and `resetAutomationUserCache()` (the
  automation user gets a new id every reseed). Fires once on boot if
  `clients` is empty, done asynchronously so it can't block `app.listen`'s
  callback. Logs the resolved database name (parsed from `DATABASE_URL`) on
  the startup line.
- `backend/src/index.ts` — `startDemoReseedScheduler()` called from the
  `app.listen` callback, next to `startReminderScheduler()` — never in
  `app.ts`, for the same reason the reminder scheduler is kept out: the
  supertest suites import `app` directly.
- `backend/.env.example` — documented `DEMO_RESEED_INTERVAL_MINUTES`.
- `.env.demo.example` (new, root) — no Resend/R2 keys, `REMINDERS_ENABLED=false`
  with a comment explaining why, `GOOGLE_CLIENT_ID` included with a note that
  it's required regardless of demo mode.
- `.gitignore` — added `.env.demo` to the ignore list (none of the existing
  patterns matched it) and `!.env.demo.example` to keep the template
  committable.
- `docker-compose.demo.yml` (new, root) — standalone, `name: cloudms-demo`,
  own `myapp_demo` database, own `postgres_data_demo` volume, `DEMO_MODE=true`
  set directly in `environment:` (not only in the env file), host ports 5434
  (db) and 8080 (nginx) so it can coexist with production's 5433/80/443.
- `nginx/demo/default.conf` (new) — plain `listen 80` (no Cloudflare origin
  cert), same `/api/v1/` proxy and SPA fallback as production's config.
- `docs/demo-deployment.md` (new) — what demo mode is, the reseed job, what
  survives a reseed and what doesn't, bring-up instructions, the
  never-point-at-production warning, and what's explicitly out of scope
  (deploy automation, DNS, backups).
- `README.md` — one-paragraph "Demo instance" section under Deployment,
  linking to the new doc.

## Tests

`backend/src/jobs/demoReseed.test.ts` (new), unit-level with an injected fake
seed function — no database writes, per CLAUDE.md's "never run `npm run
db:seed`" and the plan's caution that `wipe()` has no per-context scoping:

- `startDemoReseedScheduler()`: returns `undefined` when `DEMO_MODE` is
  unset, `"false"`, or `"TRUE"` (fail-closed on a near-miss), and when
  `NODE_ENV=test` even with demo mode on.
- Overlap guard: two concurrent `runDemoReseed()` calls invoke the seed
  function once; a third call after the first resolves invokes again; a
  rejected seed is caught, logged, and releases the guard for the next call.
  (The "still in flight" case uses a deferred promise the test resolves
  itself at the end — `running` is module-level state shared across every
  test in the file, so leaving a promise permanently unresolved there would
  have wedged every later test in this describe block. First pass at this
  test used a never-resolving promise and reproduced exactly that: the two
  tests after it failed with the seed fn never called at all.)
- `demoReseedConfig()`: default 15 min → 900000ms; `"30"` → 1800000ms;
  garbage and `"0"` both fall back to the default.

**Wipe semantics** (demo user + session survive, everything else regenerates,
bootstrap rows come back) were verified by hand against a throwaway database,
per the plan's option 1 and CLAUDE.md's "make your own database" recipe:
created `myapp_demo101`, migrated, inserted a demo user + session, ran
`seed({ preserveDemoUsers: true })` twice with `ensureBootstrapRows()` after
each (mirroring what the job does). Transcript:

```
Before first reseed: demo user id 3 session id 1
After reseed #1: users: 7, clients: 100, ... (admin + 5 staff regenerated, demo user preserved)
Demo user survived reseed #1: true isDemo: true
Session survived reseed #1: true
Client count after reseed #1: 100
After reseed #2: users: 7, clients: 100, ... (different underlying row ids)
Demo user survived reseed #2: true
Session survived reseed #2: true
All users after 2 reseeds: [demo user, admin, 5 staff, automation user] — 8 total
```

The automation user is present in the final listing (bootstrap correctly
restores it after each wipe) but not in the `users: 7` count `seed()` itself
returns, because `ensureBootstrapRows()` runs after `seed()` returns — that's
expected, `npm run db:seed`'s printed count has the same property today.
Dropped `myapp_demo101` afterward.

## Checks run (all green)

From `backend/`: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test` (411 passed, up from 400 baseline), `npm run build`. Also
`docker compose -f docker-compose.demo.yml config` (with a temporary copy of
`.env.demo.example` as `.env.demo`, removed after) to validate the compose
file syntactically. Frontend is untouched, so no frontend checks were run.

No local Postgres via Docker was available in this environment; used a local
`postgresql-16` install instead (`myapp` on `localhost:5432`) for the test
suite and the manual wipe verification. Ran `npx tsx src/db/migrate.ts`
against it, per CLAUDE.md ("additive and idempotent, safe to run").

## Deviations from the plan

- The plan wrote `demoMode()`'s import location as "likely `src/demo.ts` or
  `src/config.ts`" since the foundation issue wasn't merged when the plan was
  reviewed. It landed in `backend/src/config.ts` — imported from there
  exactly as the plan anticipated, no other change needed.
- Everything else matches the plan as approved (Approach steps 1–10). No
  scope changes.

## For the PR reviewer / next stage

- The plan's open question about an extra interlock against a misconfigured
  `DEMO_MODE=true` in production (e.g. a `DEMO_DATABASE_NAME_PREFIX` check)
  was not added — out of scope for this issue as scoped, flagged here per the
  plan's suggestion in case the reviewer wants it as a follow-up.
- `postgres_data_demo` growth (each reseed writes ~100 clients/~300 policies
  and deletes the previous set) is unaddressed, as the plan notes — worth
  watching on a small host, not a blocker.
- One-host nginx design (step 8) is what's implemented; if the demo ends up
  on a separate host, `nginx/demo/default.conf` can gain its own TLS listener
  instead of relying on a tunnel/front proxy.
