# Notes — issue #161

## Implemented

- `users.is_platform_owner` (boolean, NOT NULL, default false) —
  `backend/src/db/schema.ts`.
- `requirePlatformOwner` middleware, mirroring `requireRole`'s shape: 401 with
  no `req.user`, 403 without the flag, else `next()` — reads only
  `req.user.isPlatformOwner`, never `req.membership` —
  `backend/src/auth/middleware.ts`.
- `ensurePlatformOwner()` — new `backend/src/db/platformOwner.ts`. Reads
  `PLATFORM_OWNER_EMAIL`, no-ops if unset, otherwise insert-if-absent then
  flag-on (never flag-off). Called from `bootstrap.ts`, wrapped in try/catch
  so a throw there can't take down the rest of bootstrap in CI.
- `/auth/me`, `/auth/google`, `/auth/org` all return `user.isPlatformOwner`
  now (one shared `publicUser` helper in `auth/routes.ts`).
- `backend/.env.example` documents `PLATFORM_OWNER_EMAIL` next to
  `ADMIN_EMAIL`.
- Docs: `docs/API.md`'s `/auth/me` sample and prose; `docs/multitenancy.md`'s
  rollout item 7 and History.
- Tests: `backend/src/auth/platformOwner.test.ts` (5 cases — unbound-session
  pass, cross-org-admin-membership reject, staff-membership-inside-an-org
  still fails `requireRole`, no-cookie 401, mounted-without-requireSession
  401) and `backend/src/db/platformOwner.test.ts` (3 cases — idempotent
  across two calls, no-op when unset, promotes an existing row without
  touching its memberships). Also updated one pre-existing assertion in
  `auth/auth.test.ts` that did an exact `toEqual` on `user` and needed the new
  field added.

## Decisions

- Followed the plan's middleware/seed code close to verbatim — it was already
  reviewed and matched existing patterns (`requireRole`, the `ADMIN_EMAIL`
  block) exactly.
- `ensurePlatformOwner()` lives in its own file so it's importable and
  testable outside `bootstrap.ts`'s `main()` (which calls `process.exit`) —
  plan's Risks item 5, no change from what was proposed.

## Deviations from plan

None. Implemented exactly what plan.md scoped: schema column, middleware,
seed, session payload field, docs, tests. No new routes, `ADMIN_EMAIL`
untouched, no frontend changes.

## For the docs stage / reviewer

- Acceptance check 4 (`db:bootstrap` idempotent) verified by hand against
  this runner's own database: ran `npx tsx src/db/bootstrap.ts` twice with
  `PLATFORM_OWNER_EMAIL` set, confirmed exactly one user row with
  `isPlatformOwner: true` after both runs, then cleaned the row up.
- Per plan's Risks item 1 (still open, deferred to #162): a platform owner
  with zero org memberships can't actually sign in yet — `/auth/google` 403s
  on `memberships.length === 0`. `.env.example`'s new comment tells a
  deployer to point `PLATFORM_OWNER_EMAIL` at the same address as
  `ADMIN_EMAIL` until #162 fixes that gate.
- No `.github/workflows/` changes were needed for this issue.

## Checks run

Backend: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npx vitest run` (495 passed, 39 files), `npm run build` — all clean.
`npm run db:push` run once against this runner's own Postgres to apply the
new column before testing. No frontend changes (plan scopes none), so
`frontend/`'s checks weren't run.
