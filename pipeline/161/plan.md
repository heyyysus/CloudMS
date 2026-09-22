---
issue: 161
status: pending-review
---
# Platform-owner capability: `users.is_platform_owner` + `requirePlatformOwner`

## Goal

A user row can carry `isPlatformOwner`, and `requirePlatformOwner` lets that
user through **with no organization bound**. Done means all four acceptance
checks in #161 pass as tests:

1. Platform owner with an unbound session (no `orgId`, no memberships) → 200.
2. A user holding an `admin` membership in every org in the DB → 403. The
   capability is not reachable by accumulating memberships.
3. A platform owner with a `staff` membership is still staff inside that org —
   `requireRole("admin")` still reads only `req.membership.role`.
4. `db:bootstrap` seeds the owner from the environment and is idempotent across
   two consecutive runs.

No new routes. `/auth/me` gains one boolean so #162's frontend can branch.

Estimate: **1.5–2 hours**, most of it tests.

## Scope check

Fits roadmap item 2 (multitenancy), the piece PROJECT.md lists as *not yet
built*: "Organization creation and first-admin bootstrap". It is the first of
the three separable pieces in `docs/multitenancy.md:311` rollout item 7
("Organization creation and invite flow; retire `ADMIN_EMAIL`"). #162 spends
the capability; `ADMIN_EMAIL` retires there, not here.

Triage labels look right: `area:backend`, `risk:high`. `schema.ts` and
`auth/middleware.ts` are both deny-list, so a human merges. No frontend change
in this issue, so `frontend.yml` should not fire.

## Files / areas

Backend (7 files, plus 2 new test files):

1. `backend/src/db/schema.ts:68-82` — add `isPlatformOwner` to `users`; rewrite
   the `org_memberships` comment at `:84-85`.
2. `backend/src/auth/middleware.ts` — add `requirePlatformOwner` after
   `requireRole` (`:125`).
3. `backend/src/db/platformOwner.ts` — **new**, `ensurePlatformOwner()`.
4. `backend/src/db/bootstrap.ts` — call it, next to the `ADMIN_EMAIL` block
   (`:23-30`), leaving that block untouched.
5. `backend/src/auth/routes.ts:22-24` — `publicUser` carries the flag.
6. `backend/.env.example:18-19` — document `PLATFORM_OWNER_EMAIL` beside
   `ADMIN_EMAIL`.
7. New: `backend/src/auth/platformOwner.test.ts`,
   `backend/src/db/platformOwner.test.ts`.

Docs: `docs/API.md:76-90` (the `/auth/me` payload sample and row),
`docs/multitenancy.md` (rollout item 7 note + a History entry).

Untouched on purpose: `organizations` (see the orchestrator note — #157/#160
own those columns), `db/rls.ts` (`users` is in `AUTH_LAYER_TABLES` at `rls.ts:54`,
deliberately not RLS-protected, so nothing to add), `db/seed/users.ts`, and
all of `frontend/`.

## Approach

1. **Schema.** Add to `users`:
   `isPlatformOwner: boolean("is_platform_owner").notNull().default(false)`.
   Then rewrite the comment at `schema.ts:84-85` so it states both facts: the
   membership `role` is still the only source of a user's *role*, and
   `users.is_platform_owner` is a deployment-level *capability*, not a revival
   of `users.role`. `NOT NULL DEFAULT false` makes `db:push` non-destructive on
   live data. `User` (`types/index.ts:77`) is `$inferSelect`, so it picks the
   field up for free.

2. **Middleware.** Mirror `requireRole`'s shape exactly — fail closed on a
   missing `req.user`, so mounting it without `requireSession` 401s rather than
   passing:

   ```ts
   // Deployment-wide capability, deliberately org-independent: pair with
   // requireSession, never requireAuth - a platform owner acts before an
   // organization exists and across orgs it is not a member of.
   export function requirePlatformOwner(req: Request, res: Response, next: NextFunction) {
     if (!req.user) {
       res.status(401).json({ error: "Not authenticated" })
       return
     }
     if (!req.user.isPlatformOwner) {
       res.status(403).json({ error: "Insufficient permissions" })
       return
     }
     next()
   }
   ```

   No DB round trip: `loadSession` already returns the user row.

3. **Seed.** `ensurePlatformOwner()` in `backend/src/db/platformOwner.ts`, using
   `adminDb` (legal inside `db/`), insert-if-absent then flag-on:
   - Read `process.env.PLATFORM_OWNER_EMAIL`; return immediately if unset, so CI
     and any existing deployment behave exactly as today.
   - `.toLowerCase()` the address, matching `bootstrap.ts:27`.
   - Insert the user with `.onConflictDoNothing({ target: users.email })`, then
     `update(users).set({ isPlatformOwner: true }).where(eq(users.email, …))` —
     the update is what makes it work for an address that already has a row and
     what makes a second run a no-op.
   - **Never set the flag back to `false`.** A bootstrap that revokes based on
     env drift would lock the owner out on a config typo. Flag-on only; log the
     address it ensured, like the lines around it.

   `bootstrap.ts` calls it after the automation-user block, wrapped so it cannot
   throw the process (see Risks).

4. **Session payload.** `publicUser` (`auth/routes.ts:22`) returns
   `isPlatformOwner: user.isPlatformOwner`. All three auth routes flow through
   `meResponse`, so one edit covers `/auth/google`, `/auth/org`, `/auth/me`.

5. **Docs.** Add the field to the `docs/API.md` JSON sample and note it is
   independent of `user.role` (which stays `null` on an unbound session). In
   `docs/multitenancy.md`, mark rollout item 7's first piece done and add the
   dated History line.

## Tests

Backend, vitest + `TestContext`. `auth.test.ts:253` already shows the pattern:
a local `express()` app that mounts the middleware under test, so no production
route is needed.

`backend/src/auth/platformOwner.test.ts` — unique email prefix, `ctx.cleanup()`
plus a `like()` delete in `afterEach`, exactly like `auth/org.test.ts:17-21`:

1. Platform owner, session with `orgId: null` and zero memberships → 200.
2. `admin` membership in three `ctx.org()` orgs, `isPlatformOwner: false` → 403.
3. Platform owner with a `staff` membership hitting
   `requireAuth, requireRole("admin")` → 403 (capability grants nothing inside
   an org).
4. No cookie → 401; mounted without `requireSession` → 401.
5. `GET /auth/me` returns `isPlatformOwner` — `true` for an owner, `false` for
   an ordinary user.

`backend/src/db/platformOwner.test.ts` — calls `ensurePlatformOwner()` directly
with `PLATFORM_OWNER_EMAIL` set to a unique test address:

1. Two consecutive calls leave exactly one user row with the flag set (query by
   that email — never a global row count).
2. Env unset → no-op, no row created, no throw.
3. An address that already has a user row is promoted in place, with its
   memberships untouched.

Run: `cd backend && npx vitest run` (full suite — the commit hook runs it), plus
`npm run db:bootstrap` twice by hand against your own database to confirm
acceptance check 4 end to end.

## Touches backend

**yes**

## Risks / open questions

1. **A seeded platform owner with no membership cannot sign in today.**
   `/auth/google` 403s when `memberships.length === 0` (`auth/routes.ts:85`), so
   the capability is real but unreachable through the login flow until #162
   relaxes that gate. Handling here: leave the gate alone (this issue adds no
   route that needs it), and document that a deployment should point
   `PLATFORM_OWNER_EMAIL` at the same address as `ADMIN_EMAIL`, which does get a
   `default-org` membership. Flagging it because #162 must fix it.
2. **`bootstrap.ts` runs in CI between `db:push` and the tests** (`ci.yml:99-100`),
   so a throw here breaks every backend run. Mitigation: the new code is a no-op
   when the env var is unset (CI sets neither variable), and the `ADMIN_EMAIL`
   path is not edited at all.
3. **`schema.ts` hunk sits ~4 lines from #160's.** Per the orchestrator note:
   rebase onto `main` at `12a09ae` or later, do not hand-resolve.
4. **Name.** Going with "platform owner" as #161 argues. If a reviewer prefers
   `super_admin`, now is the moment — nothing is built on it yet.
5. **Testing bootstrap itself.** `bootstrap.ts`'s `main()` calls `process.exit`,
   so it is not importable; extracting `ensurePlatformOwner` into its own module
   is what makes the idempotence test possible. The alternative — spawning
   `npx tsx src/db/bootstrap.ts` twice from a test — is slower and no more
   honest. Say so in review if the extra file is not wanted.

## Out of scope

- Any route that uses `requirePlatformOwner` — that is #162.
- Retiring `ADMIN_EMAIL`, and the org-creation/invite flow it bootstraps (#162).
- Frontend. `frontend/src/api/auth.ts` re-derives `role` from `memberships` and
  ignores unknown payload fields, so it needs no change; typing
  `isPlatformOwner` belongs with the UI that branches on it.
- A platform-level *enum* or a second capability. One boolean until there is a
  second thing to name.
- Demoting a user whose address left `PLATFORM_OWNER_EMAIL` (see Approach 3).
