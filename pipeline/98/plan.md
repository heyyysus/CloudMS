---
issue: 98
status: pending-review
---
# Demo mode foundation: DEMO_MODE flag, `GET /config`, `POST /auth/demo`

## Goal

A backend instance can be started as a demo instance with a single env var, and
"done" means all of the following hold:

- `DEMO_MODE=true` (default off) is read through one config module, alongside a
  separate `DEMO_SESSION_TTL_MINUTES` (default 240).
- `GET /config` is unauthenticated and returns `{ demoMode: boolean }`. Behind
  nginx that is `GET /api/v1/config`; routers in this repo are mounted without
  the `/api/v1` prefix (nginx strips it), so the Express path is `/config`.
- `POST /auth/demo` exists **only** when demo mode is on — 404 otherwise, with a
  test for the 404. Body `{ name }`; it creates a fresh `users` row
  `{ name, email: demo-<random>@example.com, role: "admin", isDemo: true }`,
  mints the normal `session` cookie (same `cookieOptions` as `/auth/google`) with
  the demo TTL, and never touches Google.
- `users.is_demo boolean not null default false` exists in `src/db/schema.ts`
  and in a generated Drizzle migration; demo rows never appear in `GET /users`.
- Real sessions still use `SESSION_TTL_MS` (7 days) unchanged.

The issue is concrete; no blocking questions. Two wording mismatches with the
repo are called out under *Risks / open questions* (migration location, and how
"only mounted" is expressed in code).

## Scope check

This is not on the PROJECT.md "Direction" list (dashboard → more lines of
business → integrations → SMS/email → AI). It is enabling/infrastructure work
for a public demo deployment rather than product surface, and it sits naturally
under the "fully cloud-based" pillar: a separate deployment with its own
database, same image, one env var. It is the declared foundation for issues
#B–#E, so landing it small and self-contained matters more than product fit.

Triage labels (`enhancement`, `agent`, `pipeline:needs-plan`, `area:backend`)
look right: everything here is backend + docs; the frontend half is explicitly
issue #C. No `area:frontend` label is warranted.

## Files / areas

Add:
- `backend/src/config.ts` — new app-level config module (`demoMode()`,
  `demoSessionTtlMs()`).
- `backend/src/auth/demoRoutes.ts` — `demoAuthRouter` with `POST /auth/demo`.
- `backend/src/routes/config.ts` — `configRouter` with `GET /config`.
- `backend/src/routes/config.test.ts`, `backend/src/auth/demo.test.ts`.
- `backend/drizzle/0004_<generated>.sql` + updated `backend/drizzle/meta/`
  (produced by `npm run db:generate`, not hand-written).

Change:
- `backend/src/db/schema.ts` — `isDemo: boolean("is_demo").notNull().default(false)`
  on `users` (next to `isActive`, with a short comment).
- `backend/src/app.ts` — mount `configRouter`; conditionally mount
  `demoAuthRouter`.
- `backend/src/repositories/users.ts` — extend `visibleToAdmin()`.
- `backend/src/index.ts` — startup warning when demo mode is on.
- `backend/src/routes/testHelpers.ts` — let `makeTestUser`/`TestContext.user`
  take `NewUser` overrides so a test can create an `isDemo` user.
- `backend/.env.example` — `DEMO_MODE`, `DEMO_SESSION_TTL_MINUTES`.
- `docs/API.md` — a `## Config` section, and a demo bullet in
  `## Auth for frontend clients`.
- `docs/AUTH_SESSIONS_EXPLAINED.md` — the no-Google demo path and its own TTL.

Not changed: `backend/src/db/migrate.ts` (see Risks), `src/auth/tokens.ts`
(`SESSION_TTL_MS` stays as-is), `docker-compose.yml` (`app` already does
`env_file: .env`, so the flag flows through with no compose edit).

## Approach

1. **Config module.** `backend/src/config.ts`, modeled on `src/jobs/config.ts`
   (its `num()` helper is the pattern to copy — reject non-finite values, fall
   back to the default):

   ```ts
   export function demoMode(): boolean {
     return process.env.DEMO_MODE === "true"
   }
   export function demoSessionTtlMs(): number   // DEMO_SESSION_TTL_MINUTES, default 240
   ```

   The issue says "parsed once". Prefer functions over module-load constants
   anyway — that is the convention in `jobs/config.ts`, `mailer.ts` and
   `storage/r2.ts`, and it is what makes the value stubbable in a test. Only the
   mount decision in step 3 is evaluated once, at import time.

2. **Schema + migration.** Add `isDemo` to `users` in `src/db/schema.ts`, then
   run `cd backend && npm run db:generate` to emit `drizzle/0004_*.sql` and the
   updated `drizzle/meta/` snapshot + `_journal.json`; commit both. Apply with
   `npx tsx src/db/migrate.ts` (additive, idempotent) before running tests.
   `User`/`NewUser` in `src/types/index.ts` are inferred from the schema, so
   they pick the column up with no edit.

3. **Demo sign-in route.** `src/auth/demoRoutes.ts`:
   - zod body `{ name: z.string().trim().min(1).max(150) }` (matches
     `users.name` varchar(150)); on failure 400 with `firstIssue`-style message.
   - `email: \`demo-${randomBytes(8).toString("hex")}@example.com\`` — 16 hex
     chars, so the `users_email_unique` collision risk is negligible; if it ever
     fires, the existing `app.ts` error handler already maps 23505 → 409.
   - `createUser({ name, email, role: "admin", isDemo: true })` from
     `../repositories`.
   - Mint the session exactly like `/auth/google` does: `generateSessionToken()`,
     `createSession({ userId, tokenHash: hashToken(token), expiresAt: new
     Date(Date.now() + demoSessionTtlMs()) })`, then
     `res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: demoSessionTtlMs() })`.
     Export `cookieOptions` from `src/auth/routes.ts` (or lift it into
     `src/auth/cookies.ts`) rather than duplicating the literal — the `secure`
     flag must not drift between the two login paths.
   - Respond with the same `publicUser` shape `/auth/google` returns, so the
     frontend (#C) can reuse its existing login handling. Export `publicUser`
     from `auth/routes.ts` for this.
   - `req.log.info({ userId }, "demo user signed in")`.

   In `app.ts`: `if (demoMode()) app.use(demoAuthRouter)` — a plain literal
   conditional next to the other `app.use` calls, so on a real instance the
   route is genuinely absent and Express's default 404 answers it.

4. **`GET /config`.** `src/routes/config.ts` — a router with one unauthenticated
   handler returning `{ demoMode: demoMode() }` and nothing else. Mount it in
   `app.ts` alongside the other routers. Keep the payload to exactly that one
   key: it is a public endpoint on a real production instance too.

5. **Hide demo users from the admin list.** In
   `src/repositories/users.ts`, `visibleToAdmin()` is the single chokepoint that
   already excludes soft-deleted rows and the automation user — add
   `eq(users.isDemo, false)` to that `and(...)`. `listUsers()` is the only caller
   of it and `/users` (`src/routes/users.ts:85`) is its only consumer, so no
   other listing needs touching. Decide explicitly whether `adminUser()` should
   strip `isDemo` the way it strips `googleSub`/`deletedAt`; recommendation is to
   leave it in the payload (harmless, and it is honest about the row) — but note
   the choice in the PR description.

6. **Startup warning.** In `src/index.ts`, next to the existing
   `GOOGLE_CLIENT_ID` guard, log a loud `logger.warn` when `demoMode()` is true
   ("demo mode: /auth/demo is open and mints admin accounts"). Do not couple it
   to `NODE_ENV` — the demo deployment is itself a production deployment.

7. **Docs.** `docs/API.md`: new `## Config` section documenting
   `GET /api/v1/config` as unauthenticated, plus a bullet under `## Auth for
   frontend clients` explaining that a demo instance also offers
   `POST /auth/demo` with `{ name }` and that it 404s elsewhere.
   `docs/AUTH_SESSIONS_EXPLAINED.md`: the demo path mints the same cookie with
   no Google token, on `DEMO_SESSION_TTL_MINUTES` rather than the 7-day TTL.

## Tests

Backend, `npx vitest run` (all files; use `TestContext`/`makeSessionCookie` from
`src/routes/testHelpers.ts`, never truncate `users`, never assert a global row
count):

- `src/routes/config.test.ts`
  - `GET /config` with no cookie → 200, body exactly `{ demoMode: false }` by
    default.
  - With `vi.stubEnv("DEMO_MODE", "true")` → `{ demoMode: true }` (the handler
    reads env per request, so no module reset needed here).
- `src/auth/demo.test.ts`
  - **Off (default):** `POST /auth/demo` on the plain `import app from "../app"`
    → 404. This is the "absent when off" case the issue asks for, and it needs
    no env manipulation since unset is off.
  - **On:** `vi.stubEnv("DEMO_MODE", "true")`, `vi.resetModules()`,
    `const { default: demoApp } = await import("../app")` (dynamic import already
    appears in `src/jobs/reminders.test.ts`). Then assert: 201/200; a `users` row
    with the posted `name`, `role: "admin"`, `isDemo: true`, email matching
    `/^demo-[0-9a-f]{16}@example\.com$/`; `set-cookie` contains `session=` and
    `HttpOnly`; the returned cookie authenticates `GET /auth/me`; the persisted
    `sessions.expiresAt` is within a minute of now + 240 min (and moves when
    `DEMO_SESSION_TTL_MINUTES` is stubbed to something else).
  - 400 for a missing/blank `name`.
  - Cleanup: collect the created user ids and delete exactly those in
    `afterEach` (sessions cascade). Do **not** clean up with
    `like(users.email, "demo-%")` — that would reach rows this test did not
    create.
- `src/routes/users.test.ts` — one case: create a demo user
  (`ctx.user("demo-hidden", "admin", { isDemo: true })` once `TestContext.user`
  accepts overrides), then `GET /users` as an admin and assert the response
  contains no row with that id. Mirror the existing automation-user assertion
  style rather than counting rows.

Also run, from `backend/`: `npm run typecheck`, `npm run lint`,
`npm run format:check`. Frontend is untouched, so no frontend run is needed.

## Touches backend

yes

## Risks / open questions

- **"Migration in `src/db/migrate.ts`" is not how this repo migrates.**
  `migrate.ts` calls Drizzle's `migrate()` over the `drizzle/` folder and then
  does insert-if-absent bootstrapping; the DDL itself is generated by
  `drizzle-kit generate`. Follow the repo (step 2) rather than the issue's
  wording, and leave `migrate.ts` unchanged.
- **`vi.resetModules()` re-imports `src/db/index.ts`,** creating a second pg
  `Pool` in that test file. It should be harmless (existing suites already leave
  a pool open), but if it causes a hang or a connection-limit failure, the
  fallback is to always mount `demoAuthRouter` and put a
  `demoMode() ? next() : res.status(404).json({ error: "Not found" })` guard on
  the router. Observable behavior is identical; the issue's literal "only
  mounted" is preferred, so only fall back if the reset causes real trouble.
- **Security posture is deliberately incomplete here.** With `DEMO_MODE=true`,
  anyone can mint an admin account: no rate limit (#E) and no outbound-credential
  blocking (#B). That is acceptable only because a demo instance is a separate
  deployment with its own database. Worth restating in the PR description so the
  flag is never set on the real instance.
- **Demo rows accumulate** — one `users` row per demo sign-in, plus its session.
  Cleanup is the reseed cron (#D). Nothing here prunes them.
- **Open question for #C:** should `publicUser` (`GET /auth/me`) also expose
  `isDemo`, so the frontend can tell a demo session from a real one without a
  second call? Not needed by this issue; `GET /config` already tells the frontend
  which mode the instance is in. Flag it rather than adding the field
  speculatively.
- Demo users are hidden from `GET /users` only. They can still author policy
  logs, invoices, etc. on a demo instance, and their names will show there —
  correct behavior, but stating it avoids a surprised reviewer.

## Out of scope

- Blocking outbound email/credentials in demo mode (#B).
- Any frontend work — the demo login screen, reading `GET /config`, hiding the
  Google button (#C).
- The demo reseed / cleanup cron (#D).
- Rate limiting `POST /auth/demo` (#E).
- Seeding demo content (clients, policies, invoices) for a demo instance.
- Changing `SESSION_TTL_MS`, the Google login flow, or the invite flow.
- Excluding demo users from search, pickers, or anything other than
  `GET /users`.
