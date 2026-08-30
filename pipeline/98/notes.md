# Implementation notes — issue #98

## What was implemented

Followed `plan.md` as approved, no scope changes:

- `backend/src/config.ts` — `demoMode()` (`DEMO_MODE === "true"`) and
  `demoSessionTtlMs()` (`DEMO_SESSION_TTL_MINUTES` minutes, default 240),
  modeled on `jobs/config.ts`'s `num()` helper.
- `backend/src/db/schema.ts` — `users.isDemo` boolean, not null, default
  false. Migration generated with `npm run db:generate`:
  `backend/drizzle/0004_loud_krista_starr.sql` (+ updated `drizzle/meta/`).
  Applied locally with `npx tsx src/db/migrate.ts` before running tests.
- `backend/src/auth/routes.ts` — exported `cookieOptions` and `publicUser`
  (previously private) so the demo route can reuse them without duplicating
  the `secure` flag logic.
- `backend/src/auth/demoRoutes.ts` — `demoAuthRouter`, `POST /auth/demo`.
  Zod body `{ name: string (1-150, trimmed) }`; creates a `users` row
  (`role: "admin"`, `isDemo: true`, `demo-<16 hex>@example.com`), mints a
  session with `demoSessionTtlMs()`, sets the cookie with the same
  `cookieOptions` as `/auth/google`, logs `req.log.info`, responds with
  `{ user: publicUser(user) }`.
- `backend/src/routes/config.ts` — `configRouter`, unauthenticated
  `GET /config` → `{ demoMode: demoMode() }`.
- `backend/src/app.ts` — mounts `configRouter` unconditionally;
  `demoAuthRouter` only `if (demoMode())`, so the route is genuinely absent
  (Express default 404) when demo mode is off.
- `backend/src/repositories/users.ts` — `visibleToAdmin()` now also
  excludes `isDemo` rows, so `GET /users` (its only consumer) never lists
  them. Left `isDemo` in the `adminUser()` payload (not stripped), per the
  plan's recommendation — it's harmless and honest about the row.
- `backend/src/index.ts` — `logger.warn` on startup when `demoMode()` is
  true, not gated on `NODE_ENV` (a demo deployment is itself production).
- `backend/src/routes/testHelpers.ts` — `makeTestUser`/`TestContext.user`
  now take an optional `Partial<NewUser>` overrides param, used to create an
  `isDemo` test user.
- `backend/.env.example` — documented `DEMO_MODE` / `DEMO_SESSION_TTL_MINUTES`.
- Docs: `docs/API.md` gets a `## Config` section and a demo bullet under
  `## Auth for frontend clients`; `docs/AUTH_SESSIONS_EXPLAINED.md` gets a
  "Demo mode" subsection.

## Tests

New: `backend/src/routes/config.test.ts`, `backend/src/auth/demo.test.ts`,
plus one case added to `backend/src/routes/users.test.ts` ("excludes demo
users"). All use `TestContext`/`makeSessionCookie` from `testHelpers.ts`;
`demo.test.ts` tracks created user ids and deletes exactly those (and their
sessions) in `afterEach`, per CLAUDE.md (no `LIKE` cleanup, no global
row-count assertions).

`demo.test.ts` uses the `vi.stubEnv("DEMO_MODE", "true")` +
`vi.resetModules()` + `await import("../app")` pattern flagged as a risk in
the plan/review (new pattern in this repo, re-imports `src/db/index.ts` and
opens a second pg `Pool`). It worked cleanly in this run — full suite (395
tests) passed with no hang or connection error — so no fallback to an
always-mounted + 404-guarded router was needed.

## Checks run (all green)

From `backend/`: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test` (395 passed), `npm run build`. Frontend is untouched (frontend
work is issue #C per the plan), so no frontend checks were run.

## Deviations from the plan

None. `migrate.ts` was left unchanged as the plan called for (DDL comes from
`drizzle-kit generate`, not from editing `migrate.ts`).

## For the PR reviewer / next stage

- Security posture is intentionally incomplete, as called out in the plan:
  with `DEMO_MODE=true`, anyone can mint an admin account (no rate limiting —
  that's issue #E — and no outbound-credential blocking — issue #B). Only
  acceptable because a demo instance is a separate deployment with its own
  database; never set `DEMO_MODE=true` on the real instance.
- Demo rows accumulate (one `users` + `sessions` row per sign-in); cleanup is
  out of scope here (issue #D, the reseed cron).
- Open question carried over for issue #C (frontend): should `publicUser`
  (`GET /auth/me`) also expose `isDemo`? Not added here — `GET /config`
  already tells the frontend which mode the instance is in.
- Demo users are hidden from `GET /users` only; they can still author policy
  logs, invoices, etc., and their names will show there — correct per the
  plan, noted here so it isn't a surprise in review.

## Docs

No doc changes needed: `docs/API.md` (`## Config` section + demo bullet) and
`docs/AUTH_SESSIONS_EXPLAINED.md` ("Demo mode" subsection) were already
updated as part of the implementation commit, and both were checked against
the code (endpoint paths, response shape, TTL default, `GET /users` exclusion)
and are accurate. `README.md` doesn't enumerate individual env vars — it just
points to `.env.example`, which already documents `DEMO_MODE` and
`DEMO_SESSION_TTL_MINUTES`. No frontend UI changed (issue #C).
