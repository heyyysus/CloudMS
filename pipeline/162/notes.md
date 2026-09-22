---
issue: 162
status: implemented
---
# Notes — issue #162

## Implemented

- `POST /organizations` (`requireSession` + `requirePlatformOwner`): creates an
  org and seats its admin in one `runInOrg` transaction — seating failure rolls
  the org back, so no zero-admin org can persist.
- Invite core lifted out of `POST /users/invite` into `invites.ts`'s
  `inviteToOrg`, shared by both routes, as was `seedWelcomeTemplate(orgId)`
  from `bootstrap.ts`; `users.ts` tests pass unmodified.
- `POST /auth/google` lets a platform owner with zero memberships sign in
  (unbound session) — otherwise they could never reach the new route.
- `ADMIN_EMAIL` and the bootstrap default org are gone.

## Decisions

- `backfillOrgIds.ts` creates `default-org` only when a root table actually
  holds a null `org_id`. It is that row's last creator now, so an
  unconditional insert resurrected it on every container start.

## Review round 1

All four advisory findings fixed: the `default-org` creation above;
`ci.yml:99`'s stale comment; `POST /organizations` now returns the `email` send
result like `/users/invite`; duplicated test helpers lifted to
`TestContext.platformOwner`/`unboundCookie`.

Auth judgment (what the fixer escalated): the zero-membership exemption leaks
nothing new — every other address's response is unchanged, and reaching it
needs a valid Google token for that address. Its unbound session reaches only
`requireSession` routes, and `/auth/org` still demands an active membership,
so it binds to nothing.

## Checks run

Own throwaway Postgres 16, `PLATFORM_OWNER_EMAIL` unset: `db:push`,
`db:bootstrap` twice (idempotent, no default org), `typecheck`, `lint`,
`format:check`, `vitest run` — 503/503. Backfill both ways: no orphans → no
`default-org`; one orphan → created and adopted.
