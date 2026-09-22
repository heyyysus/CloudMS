---
issue: 162
status: pending-review
---
# Create an organization and seat its first admin

## Goal

A platform owner `POST /organizations` with a name, slug and admin email; the
response carries the new organization, and that admin can sign in, bind to it,
and see only it. An org admin gets 403 from the same route. A duplicate slug
gets 409. `POST /users/invite` behaves exactly as today. `npm run db:bootstrap`
succeeds on an empty database with `ADMIN_EMAIL` gone from the tree.

## Scope check

Roadmap item 2 / PROJECT.md's "Organization creation and first-admin
bootstrap", the last multi-tenancy gap besides the demo org
(`docs/multitenancy.md:312` item 7). Labels look right.

## Files / areas

| path | change |
|---|---|
| `backend/src/routes/organizations.ts` | new — `POST /organizations` |
| `backend/src/invites.ts` | new — invite core lifted from `routes/users.ts:52-108` |
| `backend/src/routes/users.ts` | call the lifted core |
| `backend/src/routes/schemas.ts`, `app.ts` | `createOrganizationBody`; mount the router |
| `backend/src/repositories/organizations.ts` | `createOrganization` |
| `backend/src/emails.ts` | `seedWelcomeTemplate(orgId)`, from `bootstrap.ts:63-83` |
| `backend/src/auth/routes.ts:91` | zero-membership sign-in for a platform owner |
| `backend/src/db/bootstrap.ts`, `db/seed/users.ts`, `backend/.env.example` | retire `ADMIN_EMAIL` and `default-org` |
| `docs/API.md`, `docs/multitenancy.md`, `docs/AUTH_SESSIONS_EXPLAINED.md:437`, `frontend.md` | new route; drop `ADMIN_EMAIL` setup |

## Approach

1. `createOrganization(values)` — no leading `orgId`, the same exception
   `findOrganizationBySlug` already is.
2. Lift users.ts's invite body into `inviteToOrg(orgId, {email, name, role},
   actor)`, returning a result both routes render — keeps the deleted-user and
   already-a-member 409s and the welcome email in one place.
3. New route gated `requireSession` + `requirePlatformOwner`, never
   `requireAuth`: no org context exists yet. Body `{name, slug, admin: {email,
   name?}}`.
4. Handler creates the org, then does `seedWelcomeTemplate` +
   `inviteToOrg(…, role: "admin")` inside `runInOrg(org.id, …)`.
   `email_templates`/`email_log` are RLS-protected; `organizations`, `users`
   and `org_memberships` are not (`db/rls.ts:54`) — so no policy change and no
   `adminDb`. Without the template seed the invite 500s (`emails.ts:92`).
5. Duplicate slug: catch `isPgUniqueViolation(err,
   "organizations_slug_unique")` → 409, mirroring users.ts:93.
6. `/auth/google`: 403 on zero memberships only when the user is not a
   platform owner. Otherwise the owner can never reach step 3 — `#161`'s notes
   flag this as deferred here.
7. bootstrap.ts: drop both `ADMIN_EMAIL` blocks, `default-org`, and the
   welcome-template insert hanging off it; keep `ensurePlatformOwner()` and the
   automation user. seed/users.ts: swap `ADMIN_EMAIL` for
   `PLATFORM_OWNER_EMAIL`.

## Tests

- `routes/organizations.test.ts`: created org + seated admin; org admin 403;
  no session 401; duplicate slug 409; bad body 400; admin of A cannot seat into
  B.
- `routes/crossTenant.test.ts`: add the new route to `ENTRIES`, or its
  "every registered route is accounted for" check fails.
- `routes/users.test.ts` unchanged — passing it is the proof the lift did not
  fork behaviour.
- Own database: `db:push`, `db:bootstrap` twice with no `ADMIN_EMAIL`, then
  `npx vitest run`.

## Touches backend

yes

## Risks / open questions

- If the invite fails after the org row lands, a zero-admin org persists. Delete
  the org on failure, or hold both writes in one transaction.
- Dropping `default-org`: `ci.yml:104` runs bootstrap before the tests and its
  comment claims tests need that welcome template. `TestContext.org()` seeds its
  own, so confirm by running the suite against a database bootstrapped without
  it.
- The platform owner grants admin, never holds it — no membership is written
  for the actor.

## Out of scope

Frontend console (next issue), `POST /organizations/:orgId/admins`, the demo
org, renaming or deleting an organization.
