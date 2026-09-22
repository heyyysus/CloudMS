# Plan review — issue #161

## Findings

- Scope matches the issue exactly: one boolean column, one middleware
  function, a seed, and the session-payload field — no routes, no
  `ADMIN_EMAIL` retirement. Confirmed `auth/routes.ts` has no route today
  that would need `requirePlatformOwner`, so "no new routes" holds.
- `requireSession` (not `requireAuth`) is the right pairing — verified in
  `auth/middleware.ts:40-46`: it's the only existing middleware that sets
  `req.user` without requiring org binding, exactly the precedent the plan
  cites.
- The seed approach matches `bootstrap.ts`'s existing style byte for byte:
  insert-if-absent + `.toLowerCase()` + a log line, same as the `ADMIN_EMAIL`
  block it sits beside (`bootstrap.ts:23-30`). Leaving that block untouched is
  confirmed — nothing in the plan edits it.
- `platformOwner.ts` living under `src/db/` is the correct home for the
  `adminDb` import: `eslint.config.js`'s `no-restricted-imports` rule exempts
  `src/db/**` (and `jobs/**`, `testHelpers.ts`, `*.test.ts`) by name.
- `publicUser`/`meResponse` in `auth/routes.ts:22-39` is a single shared
  helper feeding all three auth routes, so "one edit covers `/auth/google`,
  `/auth/org`, `/auth/me`" is accurate, not an assumption.
- Test plan reuses the right fixtures: `auth/org.test.ts:1-21` and
  `auth.test.ts:249-252` show the exact `TestContext` + local-`express()` +
  `like()`-cleanup pattern the plan says it will follow, and `requireRole`'s
  own cross-org test (`auth.test.ts:280-289`) is the direct model for
  acceptance check 2/3.
- Schema comment rewrite target is real: `schema.ts:83-84` currently reads
  "`role` is the sole source of a user's role - `users.role` was retired in
  sub-issue 3," which does need updating once a second user-level flag
  exists, as the plan says.
- Correctly identifies that a platform owner with zero memberships can't
  actually log in yet (`auth/routes.ts:85`, the `memberships.length === 0`
  403), flags it as a real gap, and correctly leaves it for #162 rather than
  scope-creeping a fix into this issue.
- No security concern: `isPlatformOwner` is only ever set by the seed reading
  an env var, never by request input; RLS is a non-issue since `users` is in
  `AUTH_LAYER_TABLES` (`rls.ts:54`) and nothing here writes tenant-scoped
  data through `adminDb`.

Nothing found that would change scope, direction, or soundness. Line numbers
in the plan drift slightly from current file state in a couple of spots
(e.g. the comment is at `schema.ts:83-84` not `:84-85`) but that's normal
churn, not a defect worth blocking on.

## Required changes (if rejected)

N/A

Verdict: approved
