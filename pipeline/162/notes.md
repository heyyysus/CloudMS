---
issue: 162
status: implemented
---
# Notes — issue #162

## Implemented

- `POST /organizations` (`requireSession` + `requirePlatformOwner`): creates
  an org and seats its admin atomically, using `runInOrg` as a real
  transaction (id generated app-side so it can scope the insert itself) —
  seating failure rolls the org back too, so no zero-admin org can persist.
- Lifted the invite core out of `POST /users/invite` into `invites.ts`'s
  `inviteToOrg`, returning a result both routes render; `users.ts` unchanged
  in behavior (all its tests pass unmodified).
- `seedWelcomeTemplate(orgId)` in `emails.ts`, lifted from `bootstrap.ts`.
- `POST /auth/google` lets a platform owner with zero memberships sign in
  (unbound session) — otherwise they could never reach the new route.
- `bootstrap.ts`/`db/seed/users.ts`/`.env.example`: `ADMIN_EMAIL` and the
  bootstrap default org are gone.

## Decisions

- Atomicity via `runInOrg`, not a compensating delete: keeps organization
  deletion out of the codebase entirely (explicitly out of scope) and gives a
  real rollback instead of a best-effort cleanup.

## Deviations

None.

## For the docs stage / reviewer

- `docs/API.md`, `docs/multitenancy.md`, `docs/AUTH_SESSIONS_EXPLAINED.md`,
  `frontend.md` updated for the new route and `ADMIN_EMAIL` retirement.
- `.github/workflows/ci.yml:99-101`'s bootstrap comment ("welcome email
  template, admin user") is now stale — left unedited, out of scope.

## Checks run

This runner's own database, `PLATFORM_OWNER_EMAIL` unset:
- `npm run db:push` — pass
- `npm run db:bootstrap` (twice) — pass, idempotent, no `ADMIN_EMAIL`
- `npm run typecheck && npm run lint && npm run format:check && npm test && npm run build` — pass, 503/503 tests
