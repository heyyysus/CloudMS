---
issue: 118
status: pending-review
---

# Multi-tenant 3/8: session-bound active org, membership roles, /auth/org, users admin on memberships

## Goal

After this change the *session* carries the tenant and the *membership* carries the role:

- `users.role` no longer exists. Role lives only on `org_memberships.role`; bootstrap, seed,
  emails, attachment visibility checks and every fixture read it from there.
- `POST /auth/google` binds the new session to an org when the user has exactly one active
  membership, leaves `sessions.org_id` null when they have several, and 403s when they have
  none.
- `POST /auth/org { orgId }` re-binds an existing session to any org the caller is an active
  member of, and returns the `/auth/me` payload.
- `GET /auth/me` returns `{ user, org, memberships }`.
- `auth/middleware.ts` splits into `requireSession` (used by `/auth/*` only) and `requireAuth`
  (session + active org + active membership → `req.orgId`, `req.membership`). A session with no
  org gets `403 { error: "No active organization", code: "ORG_REQUIRED" }`. `requireRole` reads
  `req.membership.role`, admin still passes everything.
- `routes/users.ts` administers *memberships of the active org*: list, invite, role/isActive
  change, and deactivate — with the actor's self-guards applied to their own membership, and
  membership deactivation killing only that org's sessions.
- `TestContext` grows `org()`, org-aware `user()` and an org-bound session cookie; every
  existing test goes through a per-context org.
- Full backend suite green; `docs/AUTH_SESSIONS_EXPLAINED.md` and `docs/API.md` match.

Domain repositories still take no `orgId` and still write `org_id` via #117's temporary column
default of 1 — that is sub-issues 4–6. So after this change the *session's* org and the org that
domain rows land in are deliberately different things; see **Risks**.

## Scope check

PROJECT.md **Direction item 2** ("Make the app multitenant…"), and the first half of
`docs/multitenancy.md`'s rollout step 3 ("`requireAuth` attaches the organization; `TestContext`
gets a per-context organization"). It also implements the doc's *Sessions and request scoping*
section: "the session is the only source of the tenant", never a client-supplied header or path
segment. #117 (organizations, memberships, `sessions.org_id`) is already merged on this branch —
verified: `organizations`/`orgMemberships` exist in `schema.ts`, `sessions.orgId` is nullable and
unread, and `bootstrap.ts` already creates org 1 plus admin/automation memberships.

Triage labels look right: `enhancement`, `area:backend`, `pipeline:needs-plan`. No `area:frontend`
label is needed — no file under `frontend/` changes (see **Out of scope** for why the frontend
keeps working anyway).

## Files / areas

Backend, schema and data:

- `backend/src/db/schema.ts` — drop `role` from `users`; keep `userRoleEnum` (still used by
  `orgMemberships`). Refresh the `orgMemberships`/`sessions.orgId` comments that say "until
  sub-issue 3".
- `backend/src/types/index.ts` — `Express.Request` gains `orgId` and `membership`; add a
  `session` (the `Session` row) field for `requireSession`.
- `backend/src/db/bootstrap.ts` — `users` inserts lose `role`; the membership inserts already
  carry it.
- `backend/src/db/seed/users.ts` — build the role list alongside the user values instead of
  reading it back off the inserted row (`orgUsers.map(u => ({... role: u.role}))` breaks).

Auth:

- `backend/src/auth/middleware.ts` — `requireSession`, `requireAuth`, `requireRole`.
- `backend/src/auth/routes.ts` — `/auth/google`, new `/auth/org`, `/auth/me`.
- `backend/src/repositories/sessions.ts` — `setSessionOrg`, `deleteSessionsByUserIdAndOrg`.
- `backend/src/repositories/orgMemberships.ts` — `listActiveMembershipsWithOrg`,
  `findActiveMembership`, `listOrgMembers`, `deactivateMembership`.
- `backend/src/routes/schemas.ts` — `setActiveOrgBody`; `inviteUserBody`/`updateUserBody` are
  unchanged (they already carry `role`, which now targets the membership).

Users admin and role readers:

- `backend/src/routes/users.ts` — all six routes.
- `backend/src/repositories/users.ts` — `listUsers()` is replaced by the org-scoped
  `listOrgMembers(orgId)`; its `visibleToAdmin()` predicate (soft-deleted + automation user
  excluded) moves into that query.
- `backend/src/emails.ts` — `sendWelcomeEmail(user, invitedBy, role)`.
- `backend/src/routes/policyAttachments.ts` (lines 72, 94) and
  `backend/src/routes/policyLogAttachments.ts` (line 35) — `req.user!.role` →
  `req.membership.role`.

Tests and docs:

- `backend/src/routes/testHelpers.ts` — `org()`, `user(prefix, role, orgId?)`,
  `makeSessionCookie(userId, orgId)`, cleanup.
- Every file that calls `makeSessionCookie`/`TestContext` (19 files: `src/auth/auth.test.ts`,
  `src/jobs/reminders.test.ts`, and the `src/routes/*.test.ts` set).
- `docs/AUTH_SESSIONS_EXPLAINED.md`, `docs/API.md` (auth section ~line 37, users section ~line
  459), and a short note in `docs/multitenancy.md` recording that `users.role` is gone.

## Approach

**1. Repository layer first (it is what everything else calls).**

- `sessions.ts`: `setSessionOrg(sessionId: number, orgId: number): Promise<Session | undefined>`
  (`db.update(sessions).set({ orgId })…returning()`), and
  `deleteSessionsByUserIdAndOrg(userId, orgId): Promise<number>` mirroring the existing
  `deleteSessionsByUserId` with an extra `eq(sessions.orgId, orgId)`. Keep
  `deleteSessionsByUserId` — the platform-level soft delete still uses it.
- `orgMemberships.ts`:
  - `listActiveMembershipsWithOrg(userId)` → inner join `organizations`, `where isActive`,
    select `{ orgId, name, slug, role }`, ordered by org name. This is both the `/auth/me`
    `memberships` array and the `/auth/google` branch input.
  - `findActiveMembership(userId, orgId)` → the existing `findMembership` plus
    `eq(orgMemberships.isActive, true)`.
  - `listOrgMembers(orgId)` → join `users`, filter `isNull(users.deletedAt)` and
    `ne(users.email, AUTOMATION_USER_EMAIL)` (lift `visibleToAdmin()` out of
    `repositories/users.ts`), select the user row plus `membership.role` / `membership.isActive`,
    ordered by `users.id` to match today's ordering.
  - `deactivateMembership(id)` — thin wrapper over the existing `updateMembership`.
  - Export all of these from `repositories/index.ts`.

**2. Drop `users.role`.** Remove the column from `schema.ts`, then fix the readers in this
order so `tsc` guides you: `auth/routes.ts` (`publicUser`), `auth/middleware.ts`,
`routes/users.ts`, `emails.ts`, the two attachment routes, `db/bootstrap.ts`,
`db/seed/users.ts`, `routes/testHelpers.ts`. `sendWelcomeEmail` takes the role as a third
argument (the membership role the invite/resend is about) rather than reading it off `user`.
Schema change ⇒ the implementing agent runs `npm run db:push` **against its own database**
(CLAUDE.md), never the shared one; CI does a fresh `db:push` + `db:bootstrap` before vitest
(`.github/workflows/ci.yml:75`), so nothing extra is needed there.

**3. Middleware.** Factor the cookie→session→user lookup that `requireAuth` does today into one
helper so the two middlewares cannot drift:

```ts
// returns the joined row, or writes the 401/403 itself and returns undefined
async function loadSession(req, res): Promise<{ session: Session; user: User } | undefined>
```

- `requireSession` = `loadSession` + `req.user = row.user`, `req.session = row.session`, `next()`.
  Same 401 (`Not authenticated`) / 403 (`Account is disabled`) responses as today.
- `requireAuth` = `loadSession`, then: `session.orgId === null` →
  `403 { error: "No active organization", code: "ORG_REQUIRED" }`; else
  `findActiveMembership(user.id, session.orgId)` → missing/inactive →
  `403 { error: "No active organization", code: "ORG_REQUIRED" }` as well (a membership revoked
  mid-session should route the user to the picker exactly like an unbound session, and the
  picker's `/auth/org` will then 403 honestly). Set `req.user`, `req.session`, `req.orgId`,
  `req.membership`.
- `requireRole(role)` — swap `req.user.role` for `req.membership!.role`; keep the admin-passes-
  everything line and the 401 fallback when the middleware chain was misassembled.
- `types/index.ts`: add `session?: Session`, `orgId?: number`, `membership?: OrgMembership` to
  the `Express.Request` interface. The issue writes these non-optional; keep them optional to
  match the existing `user?: User` and the `req.user!` convention already used in 12 route
  files — see **Open questions** if reviewers prefer the non-optional form.
- Every non-`/auth` router keeps importing `requireAuth` unchanged, so acceptance criterion
  "no route outside `/auth/*` is reachable without an active org" falls out of the middleware
  swap; `app.ts` needs no edit.

**4. Auth routes.**

- `publicUser(user, role)` → `{ id, email, name, role }` where `role` is the active membership's
  role or `null`.
- `/auth/google`: after the existing identity/`googleSub` checks, call
  `listActiveMembershipsWithOrg(user.id)`. `length === 0` → `403 { error: "Account not
  authorized" }` (same message as the no-user case — do not leak that the address exists).
  `length === 1` → `createSession({ …, orgId: m.orgId })`. `length > 1` → `createSession` with no
  `orgId`. Respond with the same `{ user, org, memberships }` object `/auth/me` builds (a
  superset of today's `{ user }`, so the frontend keeps working and sub-issue 8 has what it
  needs). Factor that object into one `meResponse(user, session, memberships)` helper used by all
  three routes.
- `/auth/org`: `authRouter.post("/auth/org", requireSession, …)`. Body `z.object({ orgId:
  z.number().int().positive() })` → 400 on parse failure. `findActiveMembership(req.user!.id,
  orgId)` → undefined → `403 { error: "Not a member of that organization" }`. Else
  `setSessionOrg(req.session!.id, orgId)` and return `meResponse`.
- `/auth/me`: `requireSession` (not `requireAuth` — the picker has to be able to read it with no
  org bound). `org` = `findOrganizationById(session.orgId)` narrowed to `{ id, name, slug }`, or
  `null`; `memberships` = `listActiveMembershipsWithOrg`.

**5. Users routes.** All keep `requireAuth` + `requireRole("admin")`, so `req.orgId` and
`req.membership` are always set. Keep the existing paths (`POST /users/invite`, not the issue
body's shorthand `POST /users`) so the frontend's `api/users.ts` keeps working; note the naming
in the PR description. `adminUser(user, membership)` becomes the one shape both list and mutate
return: the user row minus `googleSub`/`deletedAt`/`deletedBy`, plus `hasSignedIn`, with `role`
and `isActive` **taken from the membership** (they shadow the user row's own `isActive`, which
stays the platform-level flag — call this out in a comment).

- `GET /users` → `listOrgMembers(req.orgId!)`.
- `POST /users/invite` → unchanged deleted-email 409 (`findUserByEmail(email, { includeDeleted:
  true })`). For an existing live user: `findMembership(user.id, req.orgId!)` → present →
  `409 { error: "This user is already a member of this organization" }`; absent →
  `createMembership({ userId, orgId, role })` (reactivating rather than inserting if an inactive
  membership exists). For a new email: `createUser({ email, name })` then `createMembership`.
  Keep the `users_email_unique` race handling. `sendWelcomeEmail(user, req.user!, role)` is
  otherwise unchanged.
- `PATCH /users/:id` (`:id` is a **user** id) → look up `findMembership(id, req.orgId!)`; missing
  → 404 `User not found`. The self-guards keep comparing `id === req.user!.id` but compare the
  role against `req.membership!.role`; their "the install always keeps one active admin" comment
  becomes "the *organization* always keeps one active admin". `name` still updates the `users`
  row (it is global); `role`/`isActive` go to `updateMembership`. On `isActive === false` call
  `deleteSessionsByUserIdAndOrg(id, req.orgId!)`.
- `DELETE /users/:id` → now a membership deactivation: same self-guard and automation-user
  guard, `findMembership` → 404 if absent, `deactivateMembership`, then
  `deleteSessionsByUserIdAndOrg(id, req.orgId!)`, 204. `softDeleteUser`/`restoreUser` stay in
  the repository for the platform-level case; update the route's leading comment, which
  currently promises a permanent-looking global delete.
- `POST /users/:id/resend-welcome` and `POST /users/:id/restore` → require a membership in
  `req.orgId` (404 otherwise) and pass its role to `sendWelcomeEmail`; `restore` additionally
  re-activates (or creates) the membership in the active org after `restoreUser`.

**6. `TestContext`.**

- `private orgIds: number[]`, plus a cached `defaultOrgId`. `async org()` inserts
  `{ name: unique("Test Org "), slug: unique("test-org-") }` (slug is unique and capped at 64
  chars — build it from the existing `unique()` helper), tracks the id, and caches the first one
  so repeated `ctx.user()` calls share one org.
- `user(prefix, role = "staff", orgId?)` → `createUser({ email })` then
  `createMembership({ userId, orgId: orgId ?? (await this.org()).id, role })`.
- `makeSessionCookie(userId, orgId)` — module-level export, `orgId` **required**, passes it to
  `createSession`. Add `ctx.cookie(userId, orgId?)` defaulting to the context org; that is the
  mechanical replacement for today's ~60 `makeSessionCookie(u.id)` call sites and keeps the
  per-file edits to an import swap.
- `cleanup()` order matters: `org_memberships` cascades from both `users` and `organizations`,
  but **`sessions.org_id` has no `ON DELETE` clause** (`schema.ts:111`), so sessions must go
  before the org. Extend the existing FK-safe chain with: delete `sessions` for the tracked user
  ids → existing deletes → `users` → `organizations` last.
- `auth/auth.test.ts` does not use `TestContext` (it has its own `makeUser` + email-prefix
  `afterEach`). Give it a `TestContext` or a small local org fixture, and make sure the org row
  is deleted — the current `delete users where email like …` leaves it behind.

**7. Docs.** `AUTH_SESSIONS_EXPLAINED.md`: the sessions repository function list gains
`setSessionOrg`/`deleteSessionsByUserIdAndOrg`, the middleware section splits into
`requireSession`/`requireAuth`/`requireRole`, the `/auth/me` section gets the new payload, a new
`/auth/org` section, and the curl walkthrough shows the multi-org path. `API.md`: auth section
(`~:37`) documents the three auth endpoints and the `ORG_REQUIRED` 403 that any other endpoint
can now return; users section (`~:459`) re-describes the six routes as membership operations.
`multitenancy.md`: one line in *Data model* that `users.role` is gone (it currently says it
"survives until sub-issue 3") and that rollout step 3's auth half is done.

## Tests

Backend, `vitest` + `TestContext`. New/changed cases, mapping to the issue's list:

- `auth/auth.test.ts` — `/auth/google`: one active membership auto-binds (assert the persisted
  `sessions.org_id`); two memberships leave it null and the response lists both; zero active
  memberships → 403; an *inactive* membership does not count. Existing sub-mismatch/inactive-user
  cases just need an org.
- `auth/auth.test.ts` (or a new `auth/org.test.ts`) — `/auth/org`: binds to a member org and
  returns `{ user, org, memberships }`; 403 for an org the user is not an active member of; 400
  for a malformed body; 401 with no cookie.
- Middleware — `requireAuth` on an org-less session → 403 with `code: "ORG_REQUIRED"`;
  membership deactivated after the session was minted → 403; `requireRole("admin")` passes for a
  membership role of admin and fails for staff *even when another org's membership is admin*;
  `/auth/me` still answers on an org-less session. Add one representative non-auth route (e.g.
  `GET /clients`) asserting the org-less 403, which is the acceptance criterion "no route outside
  `/auth/*` is reachable without an active org".
- `routes/users.test.ts` — list returns only the active org's members (create a second org with
  its own member and assert it is absent); invite an existing user's email → membership, 201, no
  duplicate `users` row; invite an existing member → 409; PATCH changes the membership role only
  (assert the other org's membership for the same user is untouched); PATCH `isActive: false`
  deletes that org's sessions and leaves the user's session in the other org alive; DELETE
  deactivates the membership and the `users` row keeps `deletedAt === null`; self-guards.
- `repositories/orgMemberships.test.ts` / `sessions.test.ts` — the new functions.
- Everything else: mechanical — org-bound cookies. No frontend change, so no frontend run
  needed; optionally `npm run lint`/`build` in `frontend/` to confirm it is untouched.

Run: `npm run typecheck`/`lint` and `npx vitest run` in `backend/`, against the agent's **own**
database (`docker compose exec -T db createdb …` + inline `DATABASE_ADMIN_URL`/`DATABASE_URL` +
`db:push` + `db:bootstrap`), because dropping `users.role` is destructive DDL.

## Touches backend

yes

## Risks / open questions

- **The session org and the data org disagree until sub-issues 4–6.** Domain fixtures still land
  in org 1 via #117's temporary column default, while `ctx.org()` mints a fresh org for the
  session. Nothing enforces scoping yet, so tests pass — but a test that asserts "org B's admin
  cannot see org A's client" would pass for the wrong reason and then silently become
  meaningless. Restrict cross-org assertions in this sub-issue to memberships/users/sessions,
  which *are* scoped here.
- **`Express.Request` optionality.** The issue specifies `orgId: number` / `membership:
  OrgMembership` (non-optional, no `!` at call sites, but the type then lies inside `/auth/*` and
  in the error handler). This plan proposes optional + `req.orgId!` for consistency with today's
  `user?: User`. Sub-issues 4–6 add an `req.orgId` read to nearly every route, so whichever form
  is chosen should be settled here rather than churned later.
- **`req.session` naming.** Chosen for readability; `express-session` is not a dependency, so
  there is no declaration-merging collision today. If one appears, rename to `req.authSession`.
- **`role` can now be `null` in `/auth/me`** (multi-org user with no org bound).
  `frontend/src/api/auth.ts` types it as `'admin' | 'staff'` and `RequireRole` compares it. In
  practice a frontend without the picker will only ever see single-membership users, whose role
  is populated, so nothing breaks — but the type is optimistic until sub-issue 8.
- **`GET /users` `isActive` is now the membership's, not the user row's.** The payload key is
  unchanged so the admin UI keeps working, but "disabled" now means "disabled in this org". A
  platform-level disabled user (`users.isActive = false`) is invisible in the list's flag and is
  rejected earlier, at `requireSession`.
- **Invite of an existing user sends a welcome email to someone who already has an account.** The
  issue says the welcome email is unchanged; the copy ("access is already set up for this
  address") reads acceptably for a second org, so keep it and flag it rather than forking the
  template.
- `docs/multitenancy.md` mentions demo sign-in minting a user inside the demo org; that is
  sub-issue 7 and must not be anticipated here.

## Out of scope

- Threading `orgId` through domain repositories and their routes (sub-issues 4–6), including the
  still-unscoped `findEmailTemplateByKey("welcome")` that `sendWelcomeEmail` uses.
- Row-level security / `SET LOCAL app.org_id` (7).
- Frontend org picker, switcher, and the `/auth/me` consumption changes (8); no file under
  `frontend/` changes in this sub-issue.
- Organization creation / self-serve signup, per-org settings columns, per-org invoice and
  receipt numbering (4), and the demo org (7).
- Dropping the temporary `org_id DEFAULT 1` on domain tables (6).
