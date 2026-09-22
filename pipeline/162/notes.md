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
  `inviteToOrg`, shared by both routes, as was `seedWelcomeTemplate(orgId)`;
  `users.ts` tests pass unmodified.
- `POST /auth/google` lets a platform owner with zero memberships sign in
  (unbound session), or they could never reach the new route.
- `ADMIN_EMAIL` and the bootstrap default org are gone.

## Decisions

- `backfillOrgIds.ts` creates `default-org` only when a root table actually
  holds a null `org_id`. It is that row's last creator now, so an
  unconditional insert resurrected it on every container start.

## Review rounds

Round 1, four advisory findings, all fixed: the `default-org` creation above;
`ci.yml:99`'s stale comment; `POST /organizations` now returns the `email` send
result like `/users/invite`; duplicated test helpers lifted to
`TestContext.platformOwner`/`unboundCookie`.

Round 2, four more, all fixed: two over-long comments cut (one misnamed the
list it described), and `needsDefaultOrg` exported behind the `require.main`
boot guard, so `backfillOrgIds.test.ts` asserts both branches.

Auth judgment (what the fixer escalated): the zero-membership exemption leaks
nothing new — every other address's response is unchanged, and reaching it
needs that address's own Google token. Its unbound session reaches only
`requireSession` routes, and `/auth/org` still demands a membership.

## Checks run

Throwaway Postgres 16, `PLATFORM_OWNER_EMAIL` unset: `db:push`,
`db:bootstrap` twice (idempotent, no default org), `typecheck`, `lint`,
`format:check`, `vitest run` — 520/520.
