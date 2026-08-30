---
issue: 101
status: pending-review
---
# Demo mode: periodic reseed job and demo deploy definition

## Goal

"Done" means a CloudMS instance started with `DEMO_MODE=true` keeps itself
presentable without anyone touching it, and there is a committed, documented way
to deploy that instance separately from production:

- An in-process job under `backend/src/jobs/` that re-runs the existing seed
  (`src/db/seed/run.ts`) every `DEMO_RESEED_INTERVAL_MINUTES` (default **15**),
  started only from `src/index.ts`, only when demo mode is on, never overlapping
  with itself, and never taking the process down when a pass fails.
- The job runs once immediately on boot **if the database is empty**, so a fresh
  demo container comes up with data instead of a blank screen for 15 minutes.
- `wipe()` gains a demo-preserving mode: rows in `users` with `is_demo = true`
  and their `sessions` survive; everything else is regenerated. Every existing
  caller (`npm run db:seed`) keeps today's full-wipe behaviour byte for byte.
  Preserving sessions is the point — a visitor mid-click must not be logged out
  by a reseed, and the session row FKs to the user row, which is why the user
  has to survive too.
- `docker-compose.demo.yml` brings up the same images against its own
  `postgres_data_demo` volume and its own database name, with `DEMO_MODE=true`.
- A committed `.env.demo.example` with **no** Resend or R2 credentials, plus
  deploy documentation that states plainly that the demo instance must never
  point at the production `DATABASE_URL`.

**Hard dependency, and the main open question:** the foundation issue this one
depends on is **not merged**. `grep -rn "DEMO_MODE\|is_demo\|isDemo"` over the
repo returns nothing — there is no `DEMO_MODE` helper, no `users.is_demo`
column, no demo-user seeding. This issue cannot be implemented against `main` as
it stands. See Risks for how to sequence it.

## Scope check

PROJECT.md's Direction list does not mention a demo instance; this is
infrastructure/dev-experience work that sits beside the roadmap rather than on
it, supporting the "fully cloud-based" pillar in the weak sense that a hosted,
self-healing demo is how a cloud product gets shown off. That is fine for an
`enhancement` — but a reviewer should confirm the demo epic is wanted before the
coder builds the deploy half of it, since it adds a second production-ish
deployment surface to a project whose deployment story (README "Deployment",
`scripts/start.sh`, `docs/cloudflare-https.md`) is currently exactly one host.

Triage labels: `enhancement`, `agent`, `pipeline:needs-plan`, `area:backend` are
right as far as they go. `area:backend` is the bulk of it, but the change also
touches root-level infra (`docker-compose.demo.yml`, `.gitignore`, possibly
`nginx/`) and docs (`README.md`, `docs/`) — if there is an `area:infra`/
`area:docs` label in `scripts/setup-pipeline-labels.sh`, it belongs here too.
No frontend change.

## Files / areas

Add:

- `backend/src/jobs/demoReseed.ts` — the scheduler, modelled directly on
  `src/jobs/scheduler.ts`.
- `backend/src/db/bootstrap.ts` — `ensureBootstrapRows()`, extracted from
  `src/db/migrate.ts` (see Approach step 5; this is the non-obvious part).
- `backend/src/jobs/demoReseed.test.ts` — guard/config tests with an injected
  fake seed (no database writes; see Tests for why this matters).
- `docker-compose.demo.yml` — root level, standalone (not an overlay).
- `.env.demo.example` — committed template.
- `nginx/demo/default.conf` — only if the demo runs on the same host as
  production (see Approach step 8 / Risks).
- `docs/demo-deployment.md` — the demo deploy runbook.

Change:

- `backend/src/db/seed/wipe.ts` — optional `preserveDemoUsers` mode.
- `backend/src/db/seed/run.ts` — accept the wipe option, reset the faker seed,
  return counts instead of `console.table`-ing them.
- `backend/src/db/seed/rng.ts` — export a `resetRng()`.
- `backend/src/db/seed.ts` (the CLI entry) — print the counts `run.ts` no longer
  prints.
- `backend/src/db/migrate.ts` — call the extracted `ensureBootstrapRows()`.
- `backend/src/jobs/config.ts` — `demoReseedConfig()` using the existing `num()`
  helper.
- `backend/src/index.ts` — start the job next to `startReminderScheduler()`.
- `backend/.env.example` — document the new knobs.
- `.gitignore` — add `.env.demo` (today's patterns are `.env`, `.env.local`,
  `.env*.local` … none of which match `.env.demo`, so without this line a real
  demo env file is committable by accident).
- `README.md` — a "Demo instance" section pointing at the new doc.
- `PROJECT.md` — one line under Deployment, if the demo actually gets deployed.

Do not change: `src/jobs/scheduler.ts`, `planner.ts`, `dispatcher.ts`, anything
under `src/routes/`, or the frontend.

## Approach

1. **Config.** Add to `src/jobs/config.ts`, reusing the file's existing
   resolve-at-call-site convention and its `num()` helper:

   ```ts
   export interface DemoReseedConfig { intervalMs: number }
   export function demoReseedConfig(): DemoReseedConfig {
     return { intervalMs: num("DEMO_RESEED_INTERVAL_MINUTES", 15) * 60_000 }
   }
   ```

   Demo-mode detection itself comes from the foundation issue — import its
   helper (likely `demoMode()` from a `src/demo.ts` or `src/config.ts`) rather
   than re-deriving `process.env.DEMO_MODE === "true"` here. Whatever it is
   named, it must **fail closed**: anything other than an explicit `"true"` is
   not demo mode. Also reject a non-positive/NaN interval by falling back to 15
   — `num()` already handles NaN, but `DEMO_RESEED_INTERVAL_MINUTES=0` would
   otherwise produce a zero-delay interval that reseeds in a hot loop.

2. **Make the seed re-runnable in-process.** `src/db/seed/rng.ts` calls
   `faker.seed(42)` at module load, so the *second* reseed in the same process
   continues the stream and produces different data. Export

   ```ts
   export function resetRng(): void { faker.seed(42) }
   ```

   and call it at the top of `seed()` so every cycle regenerates the same demo
   dataset. This preserves the documented "re-running `db:seed` is reproducible"
   property rather than weakening it.

3. **Wipe with an option.** `wipe(options: { preserveDemoUsers?: boolean } = {})`.
   Default (`false`) executes exactly today's statement list, unchanged — the
   `db:seed` CLI must not change behaviour. When `true`:

   - Skip the unconditional `db.delete(sessions)`.
   - Replace `db.delete(users)` with
     `db.delete(users).where(eq(users.isDemo, false))`.

   Deleting a non-demo user cascades its own sessions away
   (`sessions.userId … onDelete: "cascade"`, `schema.ts:72`), so demo sessions
   survive with no extra predicate and no second statement. Keep the existing
   statement **order** as-is: `autoPolicies` is deleted before `users`, which is
   what cascades `policyLogs`/`invoices`/`payments`/`receipts`/`trustLedger`
   out of the way of the NOT NULL `author_id`/`created_by` FKs into `users`.

   Two FK edges to check while implementing: `users.deletedBy` is a self-FK with
   **no** `onDelete` action (`schema.ts:61`), so a surviving demo user whose
   `deleted_by` points at a wiped user aborts the delete; and `emailLog` is
   deleted explicitly before `users` anyway. If the self-FK bites, null out
   `deleted_by` on demo users before the delete (`db.update(users).set({
   deletedBy: null }).where(eq(users.isDemo, true))`).

4. **Have `seed()` report instead of print.** Move the `console.table` block out
   of `src/db/seed/run.ts` and into the `src/db/seed.ts` CLI entry: `seed()`
   returns the counts object, the CLI prints it, and the job logs a single
   `logger.info({ counts }, "demo reseed")` line. A 13-row `console.table` every
   15 minutes in container logs is noise, and `console.*` bypasses the pino
   logger the rest of the server uses. Give `seed()` the same options bag so the
   job calls `seed({ preserveDemoUsers: true })`.

5. **Re-ensure the bootstrap rows after every wipe — the easy thing to miss.**
   `src/db/migrate.ts` is the only place that creates the `ADMIN_EMAIL` admin
   and the `AUTOMATION_USER_EMAIL` automation user, and it runs once per
   container start (Dockerfile `CMD`). Neither row is a demo user, so the very
   first reseed deletes both; `policy_logs.author_id` is NOT NULL against the
   automation user, so the reminder dispatcher then fails on every send. Extract
   the three insert-if-absent blocks from `migrate.ts:main()` (admin, automation
   user, `welcome` template) into `src/db/bootstrap.ts`:
   `export async function ensureBootstrapRows(): Promise<void>`. Call it from
   `migrate.ts` (behaviour unchanged there) and from the reseed job immediately
   after `seed()` returns. Then call `resetAutomationUserCache()` from
   `src/jobs/automationUser.ts` — the automation user's id is memoised in module
   state and the reseed gives that row a new serial id.

6. **The job.** `src/jobs/demoReseed.ts`, structurally a copy of
   `scheduler.ts`:

   ```ts
   let running = false                     // same overlap guard, same reason
   async function tick(): Promise<void> {
     if (running) return
     running = true
     try { … } catch (err) { logger.error(err, "Demo reseed failed") }
     finally { running = false }
   }
   export function startDemoReseedScheduler(): NodeJS.Timeout | undefined
   ```

   `start…` returns `undefined` and logs one line when demo mode is off (the
   `remindersEnabled()` pattern at `scheduler.ts:53`), and uses
   `setInterval(() => void tick(), intervalMs).unref()`. Export the tick body as
   `runDemoReseed()` so a test can drive one pass directly. Take the seed
   function as an injectable parameter defaulting to the real `seed` — that is
   what makes the guard testable without a database (see Tests).

   Boot behaviour: on start, count `clients` (or `carriers`) with the
   `db.select({ count: sql<number>\`count(*)\` })` form already used in
   `run.ts:39`; if `0`, fire one `void tick()` immediately, then start the
   interval. Do this asynchronously so a slow/unreachable database does not
   block `app.listen`'s callback.

7. **Wire it up.** In `src/index.ts`, call `startDemoReseedScheduler()` inside
   the `app.listen` callback next to `startReminderScheduler()`. Keep it out of
   `app.ts` for the reason already commented there: the supertest suites import
   `app` directly, and a timer that *truncates the database* leaking into the
   test process would be catastrophic, not merely untidy. Belt and braces: have
   `startDemoReseedScheduler()` also refuse to start when
   `process.env.NODE_ENV === "test"`, and log the resolved database name
   (parsed from `DATABASE_URL`) on the line that announces the job started, so
   "which database is this thing about to wipe?" is answerable from the logs.

8. **`docker-compose.demo.yml`.** Standalone file with its own project name so
   it can coexist with production on one host:

   - `name: cloudms-demo`.
   - `app`: same `ghcr.io/heyyysus/cloudms-app:latest` image, `env_file: .env.demo`,
     `environment: DATABASE_URL=postgresql://postgres:password@db:5432/myapp_demo`
     and `DEMO_MODE=true` (set here, not only in `.env.demo`, so the mode cannot
     be lost by an incomplete env file).
   - `db`: `postgres:18.4`, `POSTGRES_DB: myapp_demo`, volume
     `postgres_data_demo:/var/lib/postgresql`, host port
     `127.0.0.1:5434:5432` (production already holds 5433).
   - `nginx`: same image; it cannot mount `./nginx/conf.d` unchanged, because
     that config listens on 443 with the production Cloudflare origin cert and
     both stacks would fight over ports 80/443. Add `nginx/demo/default.conf`
     — plain `listen 80`, same `/api/v1/` proxy to `app:8000` and same
     `try_files` SPA fallback — published on `127.0.0.1:8080:80` with Cloudflare
     Tunnel or the production nginx fronting it. If the demo gets its own host
     instead, drop this and reuse `nginx/conf.d` with its own cert; call the
     choice out in the PR.
   - `volumes: postgres_data_demo:` at the bottom. Never reference
     `postgres_data`.

9. **`.env.demo.example`.** `DEMO_MODE=true`, `DEMO_RESEED_INTERVAL_MINUTES=15`,
   `LOG_LEVEL=info`, `APP_URL`, `GOOGLE_CLIENT_ID` (note: `src/index.ts:7`
   exits if it is unset, so the demo still needs one unless the foundation
   issue's demo sign-in removes that requirement — flag it), and
   `REMINDERS_ENABLED=false` with a comment explaining why (no `RESEND_API_KEY`
   means every dispatch attempt would fail and burn `REMINDER_MAX_ATTEMPTS`).
   **No** `RESEND_API_KEY`, `MAIL_FROM`, `MAIL_REPLY_TO`, or any `R2_*` key —
   with a comment saying their absence is deliberate, so nobody "fixes" it.

10. **Docs.** New `docs/demo-deployment.md`: what demo mode is, the reseed
    cadence and its env knob, what survives a reseed (demo users + their
    sessions, `email_templates`) and what does not, the bring-up command
    (`docker compose -f docker-compose.demo.yml up -d`), and a prominent warning
    block: *the demo `DATABASE_URL` must never point at the production database
    — the reseed job deletes almost every row on a schedule.* Note that the demo
    stack has its own volume and its own compose project name, and that
    `scripts/start.sh` deliberately does not touch it. Add a short "Demo
    instance" subsection under README's Deployment linking to it, and a line in
    the `.env.example` block for the two new variables.

## Tests

**A caution that shapes the whole test plan:** `wipe()` deletes every row in the
shared database, with no per-context scoping. Calling `seed()` or `wipe()` from
a vitest file would destroy other workers' `TestContext` fixtures in CI and
other agents' data locally — exactly what CLAUDE.md's "never run `npm run
db:seed`" rule exists to prevent. So the automated tests must not invoke the
real seed or wipe.

Add `backend/src/jobs/demoReseed.test.ts` — no database writes, using the
injectable seed function:

- `startDemoReseedScheduler()` returns `undefined` and does not call the seed
  when `DEMO_MODE` is unset, `"false"`, or `"TRUE"`-with-wrong-case (fail
  closed). Restore `process.env` in `afterEach` the way `reminders.test.ts`
  does with its `ORIGINAL_ENV` snapshot.
- The overlap guard: with a fake seed that never resolves, two `runDemoReseed()`
  calls result in exactly one invocation; after the first resolves, a third call
  invokes again.
- A fake seed that rejects is caught and logged, and the guard is released
  (`finally`), so the next tick still runs.
- `demoReseedConfig()`: default 15 minutes → `900_000`; `"30"` → `1_800_000`;
  garbage and `"0"` both fall back to the default.

Wipe semantics (demo users and their sessions survive, everything else goes)
cannot be asserted safely against the shared database. Two options, reviewer's
call — the plan assumes the first:

1. Verify by hand against a throwaway database, per CLAUDE.md's "make your own
   database" recipe, and record the transcript in `pipeline/101/notes.md`:
   create `myapp_demo101`, migrate, `seed({ preserveDemoUsers: true })` twice,
   and check the demo user id and its session token survive while client counts
   are regenerated.
2. A `wipe.demo.test.ts` that `describe.skipIf(!process.env.DEMO_TEST_DATABASE_URL)`s
   itself and connects to its own database via `pg` `Client` when that variable
   is set. Safe by default, runnable deliberately. More code; more honest.

Commands to run: from `backend/` — `npm run typecheck`, `npm run lint`,
`npm run format:check`, `npm test`, `npm run build`. Also validate the compose
file syntactically without starting anything:
`docker compose -f docker-compose.demo.yml config`.

## Touches backend

Yes.

## Risks / open questions

- **The foundation issue is not merged.** There is no `DEMO_MODE` helper and no
  `users.is_demo` column on `main` today. The coder must either branch from the
  foundation PR's branch, or the pipeline must hold this issue until that lands.
  If it is genuinely blocked, say so and stop rather than inventing the
  column — a second, divergent definition of `is_demo` would be worse than a
  delay.
- **A scheduled mass-delete inside the app process is the sharpest edge in this
  repo.** Every guard in Approach steps 1, 6 and 7 (fail-closed demo check, no
  timer in `app.ts`, refuse under `NODE_ENV=test`, log the target database) is
  load-bearing. A misconfigured `DEMO_MODE=true` on the production container
  destroys production data on a 15-minute timer, and `postgres_data` is a named
  volume with no automated backup described anywhere in the repo. Worth asking
  the reviewer whether an extra interlock is wanted — e.g. refusing to reseed
  unless the database name matches a `DEMO_DATABASE_NAME_PREFIX`, or unless a
  marker row written at first seed is present.
- **Bootstrap rows vanishing after the first reseed** (Approach step 5) is the
  subtle correctness bug here. If the extraction from `migrate.ts` is skipped,
  the demo silently loses its automation user and its `ADMIN_EMAIL` admin
  fifteen minutes after boot.
- **Session survival is necessary but may not be sufficient.** A visitor's
  session survives, but every client, policy and invoice id they had open is
  regenerated, so open client tabs (persisted in `localStorage`) and any open
  dialog will 404 immediately after a reseed. Acceptable for a demo; worth a
  sentence in the doc. Whether the frontend should surface "the demo just
  reset" is a separate issue.
- **One host or two?** The nginx/ports design in step 8 changes materially
  depending on whether the demo shares the production host. The plan takes the
  same-host path because it needs no new infrastructure, but flags it.
- **Deploy automation is not in scope here.** `ci.yml` deploys production only;
  nothing updates the demo host automatically. The doc should say so explicitly
  rather than implying the demo redeploys itself.
- **`postgres_data_demo` growth.** Every reseed writes ~100 clients and ~300
  policies and deletes the previous set; Postgres autovacuum should hold steady
  state, but the volume is worth watching on a small host.

## Out of scope

- The foundation itself: the `DEMO_MODE` flag, the `users.is_demo` column and
  its migration, demo sign-in, and any demo-user seeding — that is the
  dependency issue.
- Any frontend change, including a demo banner, a reset countdown, or a "this
  is a demo" notice.
- Read-only enforcement or rate limiting for demo visitors.
- CI/CD automation for deploying the demo host, and DNS/Cloudflare setup for a
  demo hostname beyond the note in the docs.
- Changing the production compose file, `scripts/start.sh`, or the production
  nginx config.
- Changing what the seed generates (counts, shapes, faker seed value) — only
  *when* and *how* it is invoked changes here.
- Backups or restore tooling for either database.
