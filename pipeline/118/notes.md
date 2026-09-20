---
issue: 118
status: complete
---

# Implementation notes — issue #118

## Implemented

Exactly plan.md's scope: the session now carries the tenant, the membership
carries the role.

- `users.role` dropped from `schema.ts`; `org_memberships.role` is the only
  source of a user's role. `userRoleEnum` is kept (still used by
  `orgMemberships`).
- `repositories/sessions.ts`: `setSessionOrg`, `deleteSessionsByUserIdAndOrg`.
- `repositories/orgMemberships.ts`: `listActiveMembershipsWithOrg`,
  `findActiveMembership`, `listOrgMembers`, `deactivateMembership`, all
  re-exported from `repositories/index.ts`.
- `repositories/users.ts`: `listUsers()`/`visibleToAdmin()` removed (replaced
  by `orgMemberships.listOrgMembers`, which is org-scoped).
- `auth/middleware.ts`: `loadSession` helper shared by the two exported
  middlewares; `requireSession` (session only, no org - used by `/auth/*`);
  `requireAuth` (session + active org + active membership → `req.orgId`,
  `req.membership`; 403 `{ code: "ORG_REQUIRED" }` otherwise); `requireRole`
  now reads `req.membership!.role`.
- `auth/routes.ts`: `meResponse(user, session)` builds the shared
  `{ user, org, memberships }` payload for all three routes.
  `POST /auth/google` auto-binds the session's org on exactly one active
  membership, leaves it null on 2+, 403s on zero (same message as "no user
  row", to avoid leaking account existence). New `POST /auth/org` (body
  `{ orgId }`, `requireSession`) re-binds to any org the caller is an active
  member of. `GET /auth/me` uses `requireSession`, not `requireAuth`.
- `routes/schemas.ts`: `setActiveOrgBody`.
- `types/index.ts`: `Express.Request` gains `session?`, `orgId?`,
  `membership?` (optional, matching the existing `user?` / `req.user!`
  convention - see plan's "Open questions").
- `routes/users.ts`: all six routes rewired to administer memberships of
  `req.orgId`. `adminUser(user, membership)` reports `role`/`isActive` from
  the membership, shadowing the user row's own (platform-level) `isActive`.
  Invite uses the plan-review's three-way branch (found+active → 409,
  found+inactive → reactivate, not found → create). DELETE deactivates the
  membership and clears that org's sessions only; it no longer calls
  `softDeleteUser` (see Deviations). Restore re-activates or creates a
  membership in the active org after the platform-level `restoreUser`.
- `emails.ts`: `sendWelcomeEmail(user, invitedBy, role)` - role is now a
  parameter, not read off `user.role`.
- `policyAttachments.ts` / `policyLogAttachments.ts`: `req.user!.role` →
  `req.membership!.role`.
- `db/bootstrap.ts`, `db/seed/users.ts`: `role` no longer passed to
  `createUser`; seed builds the role list alongside the insert values instead
  of reading it back off the inserted row.
- `routes/testHelpers.ts`: `TestContext.org()` (always inserts a fresh org,
  and caches the *first* one as the context's default), a private
  `defaultOrg()` used internally so repeated `user()`/`cookie()` calls with
  no explicit `orgId` share that one org, `user(prefix, role, orgId?)`
  creates a membership, `cookie(userId, orgId?)`, module-level
  `makeSessionCookie(userId, orgId)` (`orgId` now required). `cleanup()`
  deletes sessions for tracked users first, then the existing FK-safe chain,
  then organizations last, and resets `defaultOrgId`/`orgIds` so the next
  test in the same file gets a fresh default org rather than reusing a row
  the previous test's cleanup just deleted (see Deviations).
- All 19 call sites of `makeSessionCookie`/`TestContext` updated (mechanical
  `makeSessionCookie(x.id)` → `ctx.cookie(x.id)`), plus real logic changes in
  `auth/auth.test.ts` (new `auth/org.test.ts` for `/auth/org`) and
  `routes/users.test.ts` for the new membership semantics.
  `repositories/sessions.test.ts` and `repositories/orgMemberships.test.ts`
  cover the six new repository functions.
- Docs: `docs/AUTH_SESSIONS_EXPLAINED.md` (function lists, the
  `requireSession`/`requireAuth` split, `/auth/me` payload, a new `/auth/org`
  section, multi-org curl walkthrough), `docs/API.md` (auth section documents
  all three `/auth/*` routes and `ORG_REQUIRED`; Users section documents all
  six routes as membership operations - it previously undocumented `DELETE`
  and `restore` even before this change), `docs/multitenancy.md` (`users.role`
  is gone; rollout step 3 split into its done auth half and its still-open
  repository/route half).

## Decisions

- **`TestContext.org()` caches only the first call, not every call.** The
  plan's literal formula for `user()` was `orgId ?? (await this.org()).id`,
  which read as "org() always inserts, so every `ctx.user()` with no explicit
  `orgId` gets its own fresh org" - but that breaks the common pattern of an
  admin and a target user needing to share an org (used throughout the
  existing suite, e.g. admin PATCHing a target's membership). Implemented as:
  `org()` always inserts (so an explicit second call, for a cross-org test,
  gets a genuinely different org) and also caches the *first* one it ever
  creates; `user()`/`cookie()` reuse that cached default rather than calling
  `org()` again. This matches the plan's stated intent ("caches the first one
  so repeated `ctx.user()` calls share one org") more literally than the
  formula did.
- **`cleanup()` resets `defaultOrgId`/`orgIds`.** Found by running the suite:
  `TestContext` instances are typically module-scoped
  (`const ctx = new TestContext()` at file top, `afterEach(() => ctx.cleanup())`),
  so without resetting the cache, the *second* `it()` in a file would reuse a
  `defaultOrgId` whose row the *first* test's `cleanup()` had just deleted,
  and any `createMembership` referencing it would fail its FK. Not called out
  explicitly in the plan; a necessary consequence of per-test cleanup plus a
  per-context cache.
- **`DELETE /users/:id` uses `findMembership`, not `findActiveMembership`,
  for its 404 check** (plan's literal wording) - so deactivating an
  already-deactivated membership is an idempotent `204`, not a `404`. Updated
  the corresponding test's expectation to match (it previously expected
  `404` under the old global-soft-delete semantics).
- **Platform-level soft delete (`softDeleteUser`/`restoreUser`) is no longer
  reachable through any route in this sub-issue.** `DELETE /users/:id` now
  only deactivates the org membership (per plan), so nothing sets
  `users.deletedAt` anymore via the API. The "re-invite a deleted email" 409
  and `POST /users/:id/restore` still exist for that platform-level case (per
  plan, "stay in the repository for the platform-level case") but are now
  only exercisable by calling `softDeleteUser` directly - which is what the
  updated tests do. This is a real, if narrow, gap: nothing in this
  repository can currently produce that state through the app itself. Flagged
  as an open question for the reviewer/docs stage rather than silently
  expanding scope to add a platform-admin route for it.
- **`POST /users/:id/restore`'s new-membership path defaults role to
  `"staff"`** when there's no existing membership row to reactivate (the
  route takes no body). Not specified by the plan; a reasonable default given
  invite already defaults the same way.

## Deviations from plan

None beyond the review's already-called-out invite three-way branch fix,
which is implemented as specified in review.md.

## For the docs stage / reviewer

- `docs/API.md`'s Users section, as rewritten, also documents `DELETE
  /users/:id` and `POST /users/:id/restore` for the first time - the
  pre-existing doc predated both routes' existence in code (unrelated to this
  sub-issue) and claimed "There is no `DELETE /users/:id`". Worth a
  double-check that the new wording reads well in context.
- The "platform-level soft delete is currently unreachable through any route"
  point above (see Decisions) may be worth a follow-up issue rather than
  living only in this note.
- `docs/AUTH_SESSIONS_EXPLAINED.md` still has one pre-existing staleness this
  sub-issue didn't touch: the `repositories/users.ts` section's prose
  describes a `deleteUser(id)` function that doesn't exist (it's actually
  `softDeleteUser`/`restoreUser`) - predates this change, left as-is to keep
  the diff scoped to what the plan called for.
- Frontend is untouched (confirmed via `git diff --stat origin/main --
  frontend`, empty); `npm run lint` and `npm run build` in `frontend/` both
  pass with only pre-existing warnings.

## Checks run

All against this runner's own isolated Postgres (`DATABASE_URL`/
`DATABASE_ADMIN_URL` already set in the environment; `pg_trgm` extension
was missing on this fresh instance and was created once with `CREATE
EXTENSION IF NOT EXISTS pg_trgm` before `db:push` - unrelated to this
change, just this runner's baseline).

- `backend/`: `npm run db:push` (destructive DDL, safe here - this runner's
  own database), `npm run db:bootstrap`, `npm run typecheck`, `npm run lint`,
  `npm run format:check` (after running `npm run format` once to fix
  formatting), `npx vitest run` - 423 tests passing across 33 files, `npm run
  build` - all clean.
- `frontend/`: `npm run lint`, `npm run build` - both clean (pre-existing
  warnings only, no files touched).

No `.github/workflows/` changes were needed for this sub-issue.

Branch is pushed: `agent/issue-118`.
