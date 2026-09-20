# Plan review — issue #118

## Findings

- **Invite-reactivation branch is internally contradictory** (plan lines 183–184, `Approach` step
  5). The plan says `findMembership(user.id, req.orgId!)` → *present* → 409, *absent* →
  `createMembership(...)` "(reactivating rather than inserting if an inactive membership
  exists)". But `findMembership` (unlike `findActiveMembership`) returns a row regardless of
  `isActive`, so an inactive membership is "present," which the same sentence says should 409 —
  yet the parenthetical says that case should instead reactivate. As written, re-inviting a
  previously-deactivated member either 409s incorrectly or, if coded to fall into `createMembership`
  anyway, hits the `(user_id, org_id)` unique constraint and throws unhandled (there's no
  `isPgUniqueViolation` catch on this path the way `users_email_unique` gets one). The implementing
  agent needs the three-way branch made explicit: found+active → 409, found+inactive → update
  `isActive: true` (+ role), not found → `createMembership`. Worth a line of clarification, but not
  fatal — the rest of the invite flow (new-email path, 409 on live duplicate, welcome-email
  argument change) is sound and the fix is local to one route.
- Everything else checks out on spot-check: `sessions.orgId` has no `onDelete` (schema.ts:111,
  matches the plan's cleanup-ordering claim); `users.role`/`orgMemberships`/`organizations` are in
  the exact pre-#117-merged state the plan describes; the `policyAttachments.ts:72,94` /
  `policyLogAttachments.ts:35` `req.user!.role` sites and the `seed/users.ts:68`
  `role: u.role` read-back both exist exactly as cited; the 19-file `makeSessionCookie`/
  `TestContext` consumer count (excluding `testHelpers.ts` itself and `db/roles.test.ts`, which only
  mentions `TestContext` in a comment) is correct; `bootstrap.ts` already creates org 1 and
  admin/automation memberships as claimed.
- Scope matches the issue precisely: auth + users-admin only, domain repositories and RLS
  correctly deferred to 4–7, frontend correctly untouched, the still-unscoped welcome-email
  template lookup is explicitly flagged as out of scope rather than silently patched.
- Direction is correct: this is rollout step 3 of `docs/multitenancy.md`, sequenced after #117
  (already merged on this branch), and the plan explicitly restricts cross-org test assertions to
  memberships/users/sessions since domain rows still land in org 1 under the temporary default —
  a real and correctly-flagged risk rather than a false "it's already fully scoped" claim.
- Security is sound: `/auth/org` re-checks `findActiveMembership` before rebinding (no
  client-supplied org is trusted without verifying membership), `requireAuth` treats a revoked
  membership the same as an unbound session (`ORG_REQUIRED`) rather than a stale pass-through,
  deactivating a membership tears down that org's sessions immediately, and the `/auth/google` 403
  message is kept identical between "no user" and "no active membership" so the endpoint doesn't
  leak account existence.
- Tests route through `TestContext.org()`/`user()`/`cookie()` per CLAUDE.md's fixture convention,
  and the destructive `users.role` schema drop is correctly called out to run against the agent's
  own database via `db:push`, never the shared one.
- Two deliberately-flagged open questions (`Express.Request` field optionality, `req.session`
  naming) are reasonable judgment calls with stated rationale, not unresolved vagueness — fine to
  leave to the implementing agent rather than blocking on them here.

## Required changes (if rejected)
N/A

Verdict: approved
