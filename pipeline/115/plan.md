---
issue: 115
status: pending-review
---
# Multi-tenancy: organizations, memberships, session-bound org, org-scoped repositories + RLS

## Goal

One deployment serves several agencies. Concretely, "done" is all of:

1. **Schema.** An `organizations` table and an `org_memberships` table exist;
   `users.role` is gone; `sessions.org_id` exists; all 21 tenant-owned tables
   listed in the issue carry `org_id NOT NULL` with an FK to `organizations`
   and a composite index led by `org_id`. `email_templates.key` is unique per
   org. `invoices.invoice_number` / `receipts.receipt_number` exist and are
   unique per org, allocated from counters on `organizations`.
2. **Auth.** `POST /auth/google` binds the session to the user's single active
   membership, or to no org when there are several. `POST /auth/org` sets it.
   `GET /auth/me` returns `{ user, org, memberships }`. `requireAuth` rejects a
   session with no org on every non-`/auth/*` route with a 403 carrying a
   distinct code; `requireRole` reads the membership role for the session's org.
   Deactivating or removing a membership drops that user's sessions for that org.
3. **Isolation, layer 1.** Every repository function takes `orgId` as its first
   parameter and filters on it; routes pass `req.orgId`. A forgotten scope is a
   compile error.
4. **Isolation, layer 2.** `ENABLE` + `FORCE ROW LEVEL SECURITY` with an
   `org_id = current_setting('app.org_id')` policy on every tenant table; the
   API and the test suite connect as a non-superuser `app` role
   (`DATABASE_URL`), the owner role is used only by `db:push`, the seed and the
   scheduler (`DATABASE_ADMIN_URL`). A query that forgets its filter returns
   nothing.
5. **Schema management.** `backend/drizzle/` is deleted; `npm run db:push`
   replaces generate/migrate; `src/db/migrate.ts` becomes `src/db/bootstrap.ts`
   (default org, admin user + admin membership, automation user, per-org
   welcome template). Dockerfile and CI call the new commands.
6. **Seed.** A hardcoded `"default org"` holds the 100 clients / 300 policies
   and the staff users; a small `"second org"` holds a handful of clients and
   its own staff; `ADMIN_EMAIL` is a member of both.
7. **Frontend.** An org picker after login when there is more than one
   membership, the org name plus a switcher in the sidebar, and a document
   title of `<org name> · CloudMS`. Invoice/receipt numbers displayed from the
   new columns, not from `id`.
8. **Tests.** `TestContext` creates and tears down its own throwaway org; a
   dedicated cross-tenant test asserts every list endpoint excludes and every
   detail/update/delete endpoint 404s the other org's rows; the suite runs as
   the `app` role so RLS is live under test.
9. **Docs** (`docs/multitenancy.md`, `docs/API.md`,
   `docs/AUTH_SESSIONS_EXPLAINED.md`, `PROJECT.md`, `CLAUDE.md`,
   `backend/.env.example`) describe what was built.

The issue is specific enough to plan concretely. Six decisions it does not
settle are listed under *Risks / open questions*; none of them block starting.

## Scope check

This is **Direction item 2** in `PROJECT.md` ("Make the app multitenant so it
can be released to more than one agency"), and it implements steps 1–4 and 8 of
the rollout order in `docs/multitenancy.md`. PROJECT.md's Current State already
says "Multi-tenancy is designed but not built" and the Deployment paragraph
already says "Today the schema has no organization yet" — both sentences change
with this work. It touches the **fully cloud-based** pillar (one deployment for
every agency) and nothing else.

Where the issue deliberately **supersedes `docs/multitenancy.md`** — the doc
must be rewritten to match, not just appended to:

| `docs/multitenancy.md` says | The issue decides |
| --- | --- |
| `org_id` on `users`; one user, one org; membership table "Open" | `org_membership`, `users.role` removed, user is global |
| RLS is a later backstop (step 8) | RLS lands in this issue |
| Backfill migrations create org 1 and assign existing rows | `drizzle/` is deleted, `db:push`, data loss accepted |
| Every agency-level env var moves to `organizations` | Only `AGENCY_NAME` → `organizations.name`; the rest is a separate issue |
| Demo org is part of the design | Explicitly out of scope |

**Triage labels.** `enhancement` and `pipeline:needs-plan` are right.
`area:backend` is right but incomplete — this also changes `frontend/` (picker,
switcher, auth context, invoice/receipt display, title) and infrastructure
(`docker-compose.yml`, `backend/Dockerfile`, `.github/workflows/ci.yml`,
`backend/.env.example`), so `area:frontend` and an infra label belong on it too.
The `agent` label looks wrong — nothing here concerns the agent pipeline; it is
probably an artifact of the issue having been filed by the automation.

## Files / areas

### Backend — schema and infrastructure

| Path | Change |
| --- | --- |
| `backend/src/db/schema.ts` | `organizations`, `orgMemberships`; drop `users.role`; `sessions.orgId`; `orgId` + composite indexes on 21 tenant tables; per-org uniques; `invoices.invoiceNumber`, `receipts.receiptNumber` |
| `backend/src/db/relations.ts` | relations for the two new tables; org relation on each tenant table as needed by `db.query` calls |
| `backend/src/types/index.ts` | `Organization`, `OrgMembership`, `New*` types; `Express.Request` gains `orgId`, `membership` |
| `backend/src/db/index.ts` | `app`-role pool (`DATABASE_URL`) + admin pool (`DATABASE_ADMIN_URL`); export `adminDb` |
| `backend/src/db/context.ts` **(new)** | `AsyncLocalStorage` holding the request-bound Drizzle handle; `db` resolves through it (see Approach step 4) |
| `backend/src/db/rls.sql` + `backend/src/db/rls.ts` **(new)** | creates/grants the `app` role, enables + forces RLS, installs one policy per tenant table; run by `db:push` |
| `backend/src/db/migrate.ts` → `backend/src/db/bootstrap.ts` | drops `migrate()`; bootstraps default org, admin user + membership, automation user, per-org welcome template |
| `backend/drizzle/**` | **deleted** (all SQL, `meta/`, `_journal.json`) |
| `backend/drizzle.config.ts` | point `dbCredentials.url` at `DATABASE_ADMIN_URL` |
| `backend/package.json` | remove `db:generate`/`db:migrate`; add `db:push` (push + `rls.ts`) and `db:bootstrap` |
| `backend/Dockerfile` | drop `COPY drizzle`; CMD runs `dist/db/bootstrap.js` (see Risks on where `push` runs) |
| `docker-compose.yml`, `docker-compose.build.yml` | add `DATABASE_ADMIN_URL`, point `DATABASE_URL` at the `app` role |
| `backend/.env.example` | `DATABASE_ADMIN_URL`, `APP_DB_PASSWORD`; drop `AGENCY_NAME` |
| `.github/workflows/ci.yml` | replace `npx ts-node src/db/migrate.ts` with push + rls + bootstrap; add `DATABASE_ADMIN_URL` |

### Backend — auth and request scoping

`backend/src/auth/middleware.ts` (`requireSession` without an org,
`requireAuth` with one, `withOrgContext`, `requireRole` off the membership),
`backend/src/auth/routes.ts` (`POST /auth/org`, reshaped `/auth/me` and
`/auth/google`), `backend/src/repositories/sessions.ts`
(`updateSessionOrg`, `deleteSessionsByUserIdAndOrg`, session row now carries
`orgId`), `backend/src/repositories/organizations.ts` **(new)**,
`backend/src/repositories/orgMemberships.ts` **(new)**.

### Backend — repositories and routes

Every file in `backend/src/repositories/` (22 modules, ~150 exported
functions) and every file in `backend/src/routes/` (23 routers). Also
`backend/src/accountingDocuments.ts`, `backend/src/accountingLogs.ts`,
`backend/src/invoiceLabels.ts` (invoice/receipt *number* instead of `id`),
`backend/src/emails.ts`, `backend/src/jobs/config.ts` (`agencyIdentity()` takes
the org), `backend/src/jobs/planner.ts`, `backend/src/jobs/dispatcher.ts`,
`backend/src/jobs/automationUser.ts` (run on `adminDb`; derive `org_id` from the
policy).

### Backend — seed and tests

`backend/src/db/seed/{run,users,wipe,carriers,households,policies,financials}.ts`,
`backend/src/routes/testHelpers.ts`, every `*.test.ts` under `backend/src`
(~25 files), plus a new `backend/src/routes/crossTenant.test.ts` and
`backend/src/auth/org.test.ts`.

### Frontend

`src/api/auth.ts`, `src/auth/AuthContext.tsx`, `src/auth/RequireAuth.tsx`,
`src/auth/RequireRole.tsx`, `src/pages/SelectOrg.tsx` **(new)**, `src/App.tsx`,
`src/components/layout/app-layout.tsx`, `src/components/layout/app-sidebar.tsx`
(+ its story), `src/components/layout/user-menu.tsx`,
`src/components/clients/invoice-payment-dialog.tsx`,
`src/components/clients/invoice-receipt-dialog.tsx`,
`src/components/clients/policy-ledger.tsx`, `src/api/invoices.ts`,
`src/api/users.ts`, `src/pages/ManageUsers.tsx`.

### Docs

`docs/multitenancy.md` (rewrite), `docs/API.md`,
`docs/AUTH_SESSIONS_EXPLAINED.md`, `PROJECT.md`, `CLAUDE.md`, `README.md`.

## Approach

This is large enough that it should land as an ordered series of commits/PRs on
one branch; each step below is a reviewable unit and steps 1–5 must land
together before the suite is green again.

**1. Schema.**
Add to `schema.ts`, following the existing table style:

```ts
export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  // Next number to hand out; allocated inside the creating transaction.
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  nextReceiptNumber: integer("next_receipt_number").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const orgMemberships = pgTable("org_memberships", { /* userId, orgId,
  role: userRoleEnum, isActive, timestamps */ },
  (t) => [unique("org_memberships_user_id_org_id_unique").on(t.userId, t.orgId),
          index("org_memberships_org_id_idx").on(t.orgId)])
```

- `users`: delete the `role` column. `email`/`googleSub` uniques, `isActive`,
  `deletedAt`/`deletedBy` all stay — they are the global kill switch.
- `sessions`: `orgId: integer("org_id").references(() => organizations.id, {
  onDelete: "cascade" })`, nullable.
- Each of the 21 tenant tables gets
  `orgId: integer("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" })`.
  Cascade is what lets `TestContext.cleanup()` delete one org row.
- Rewrite each table's existing single-column index as a composite led by
  `org_id` (`auto_policies_client_id_idx` → `(org_id, client_id)`, etc.); leave
  the trigram GIN indexes alone but add a plain `(org_id)` index where the table
  had none.
- Per-org uniques: `email_templates (org_id, key)`,
  `reminder_rules (org_id, trigger, offset_days)`, `carriers (org_id, naic)`,
  `auto_policies (org_id, policy_number)`. The last two are not named in the
  issue but are today global uniques on tenant-owned data — see open questions.
  Uniques that are already implied by an org-scoped parent stay as they are
  (`vehicles (policy_id, vin)`, `policy_logs (policy_id, log_number)`,
  `drivers.person_id`, `receipts.payment_id`, `policy_attachments.storage_key`).
- `invoices.invoiceNumber` / `receipts.receiptNumber`: `integer().notNull()`
  plus `unique("invoices_org_id_invoice_number_unique").on(orgId, invoiceNumber)`.
  Update the two "id doubles as the agency-wide sequential number" comments.

**2. Schema management.** Delete `backend/drizzle/`. `db:push` becomes
`drizzle-kit push && tsx src/db/rls.ts`; `drizzle.config.ts` reads
`DATABASE_ADMIN_URL`. Rename `migrate.ts` → `bootstrap.ts`, drop the
`migrate()` call and the `kind` back-fill update (no legacy rows survive a
push-based reset), and make it: insert the default org (`on conflict (slug) do
nothing`), the `ADMIN_EMAIL` user plus an `admin` membership in that org, the
automation user with **no** memberships, and a `welcome` template for every
existing org.

**3. Two roles.** `rls.ts` connects with `DATABASE_ADMIN_URL` and runs
`rls.sql`, which is idempotent:

```sql
do $$ begin
  if not exists (select from pg_roles where rolname = 'app') then
    execute format('create role app login password %L', :'app_password');
  end if;
end $$;
grant connect on database ... ; grant usage on schema public to app;
grant select, insert, update, delete on all tables in schema public to app;
grant usage, select on all sequences in schema public to app;
-- per tenant table:
alter table clients enable row level security;
alter table clients force row level security;
drop policy if exists clients_org_isolation on clients;
create policy clients_org_isolation on clients
  using      (org_id = nullif(current_setting('app.org_id', true), '')::int)
  with check (org_id = nullif(current_setting('app.org_id', true), '')::int);
```

Note the `missing_ok = true` second argument plus `nullif`: with the GUC unset,
`current_setting('app.org_id')` would *raise*, which would turn every
un-scoped query into a 500 instead of an empty result. `organizations`, `users`,
`org_memberships` and `sessions` get grants but **no** RLS — auth has to work
before an org is known. Generate the per-table block from a `TENANT_TABLES`
array in `rls.ts` so adding a table can't silently skip its policy. Because
`drizzle-kit push` can create tables, `db:push` always runs `rls.ts` after it.

**4. Request-scoped connection.** `src/db/context.ts` holds an
`AsyncLocalStorage<NodePgDatabase>`; `db` becomes a thin proxy that resolves to
the store's handle when one is set and to the pool-backed instance otherwise, so
the ~150 repository call sites keep their current shape. A `withOrgContext`
middleware (mounted right after `requireAuth`) checks a client out of the pool,
runs `select set_config('app.org_id', $1, false)`, runs the rest of the request
inside `als.run(drizzle(client), next)`, and on `res` `finish`/`close` issues
`discard all` (or `reset all`) and releases the client.

*Deviation from the issue, deliberate:* the issue says each request runs its
repository calls "inside a transaction that starts with `SET LOCAL`". A single
transaction spanning a whole request would stay open across PDF generation and
R2 round-trips in `policyAttachments`/`accountingDocuments`, which is a real
hazard (long idle-in-transaction holds, and a failed R2 call rolling back
committed-looking work). Pinning one connection per request and setting the GUC
at *session* scope gives RLS exactly the same guarantee, and the existing
repository-level `db.transaction(...)` calls still work unchanged because they
run on that same pinned connection. See Risks for the pool-sizing consequence
and the open question if a reviewer wants the literal transaction.

**5. Auth flow.**
- `requireSession` (new): resolves the session + user, 401/403 as today, sets
  `req.user` and `req.session`. Does not require an org. Used by `/auth/me` and
  `/auth/org`.
- `requireAuth` = `requireSession` + org: if `session.orgId` is null, or the
  matching membership is missing/inactive, respond
  `403 { error: "Select an organization", code: "ORG_REQUIRED" }`. Otherwise set
  `req.orgId` and `req.membership`, then hand off to `withOrgContext`. Export the
  pair as one array so every `requireAuth` call site stays a one-liner.
- `requireRole` compares `req.membership!.role` (admins still pass every check).
- `POST /auth/google`: after the existing identity checks, call
  `listActiveMembershipsForUser(user.id)`. Zero → 403 "Account not authorized"
  (a global user with no membership, e.g. the automation user, can never sign
  in). One → `createSession({ ..., orgId })`. More → `orgId: null`. Respond with
  the same `{ user, org, memberships }` shape as `/auth/me`.
- `POST /auth/org { orgId }`: `requireSession`; 403 unless the caller has an
  active membership for that org; `updateSessionOrg(session.id, orgId)`.
- `GET /auth/me`: `requireSession`; `{ user, org, memberships }` where
  `memberships` is `{ orgId, name, slug, role }[]` and `user.role` is the role
  for the active org (null when no org is selected).
- Membership deactivate/remove calls `deleteSessionsByUserIdAndOrg`, mirroring
  what `PATCH /users/:id` already does with `deleteSessionsByUserId`.

**6. Repositories.** Mechanical, module by module: `orgId: number` becomes the
first parameter and every `where` gains `eq(table.orgId, orgId)` inside the
existing `and(...)`; every insert sets `orgId`. For `db.query.*` relational
reads (`getClientWithDetails`, `getInvoiceWithDetails`,
`listInvoicesByPolicyId`) put `orgId` in the top-level `where` — the nested
`with` rows are reachable only through an already-scoped parent, and RLS covers
them regardless. Child inserts verify the parent is in the same org before
writing (`createVehicle` reads the policy's `orgId`, `addDriverToPolicy` checks
both sides, `createInvoiceWithDetails` already selects the policy in its
transaction — add `eq(autoPolicies.orgId, orgId)` to that select and the
existing `if (!policy) return undefined` becomes the cross-org 404). `search.ts`
builds raw SQL — add the `org_id` predicate to each branch. Replace the stale
"none of the tables have an owner/tenant column today" comment at the top of
`repositories/index.ts` with the rule this issue establishes.

**7. Numbering.** Inside the existing create transactions:

```ts
const [org] = await tx.update(organizations)
  .set({ nextInvoiceNumber: sql`${organizations.nextInvoiceNumber} + 1` })
  .where(eq(organizations.id, orgId))
  .returning({ next: organizations.nextInvoiceNumber })
const invoiceNumber = org.next - 1
```

The row update serializes concurrent allocations. Same shape for
`receiptNumber` in the payment transaction in `repositories/payments.ts`. Then
thread the number (not the id) through `accountingLogs.ts`
(`invoiceCreatedLogBody` etc. take `invoiceNumber`), `accountingDocuments.ts`
and `invoiceLabels.ts` for the PDFs, and the three frontend components that
render `Invoice #{invoice.id}` / `Receipt #{receipt.id}`.

**8. Storage keys.** `attachmentKeyPrefix(policyId)` in
`repositories/policyAttachments.ts` becomes
`attachmentKeyPrefix(orgId, policyId)` returning
`` `org/${orgId}/policies/${policyId}/` ``. The presign route already validates
that a client-supplied `storageKey` starts with the prefix — that check now
pins the org too. Update `createPolicyAttachment`, the accounting-document
writer, and the test fixtures that hardcode `policy-attachments/...`.

**9. Jobs.** The planner's one `INSERT ... SELECT` is cross-org by construction
and runs with no request context, so under FORCE RLS as the `app` role it would
insert nothing. Give `jobs/` the admin pool (`adminDb`) — it is trusted server
code, not request-handling. `scheduled_emails.org_id` is taken from the policy
in the same statement (`select ..., p.org_id`). The dispatcher resolves the
policy's org and renders `{{agentName}}` from `organizations.name` instead of
`AGENCY_NAME`; `agencyIdentity()` in `jobs/config.ts` takes the org row and
keeps reading `MAIL_REPLY_TO` from the environment (moving that is out of
scope). `automationUser.ts` keeps its single global `users` row with no
memberships.

**10. Users routes.** All four endpoints operate on memberships of
`req.orgId`; the path stays `POST /users/invite` (the issue writes `POST
/users`, but there is no such route today and renaming it is gratuitous churn).
`GET /users` joins `org_memberships` → `users` for the active org, still hiding
the automation user and soft-deleted rows, with `role`/`isActive` read from the
membership. Invite: look the email up globally; if an active user exists, add a
membership (409 only if one already exists *in this org*); otherwise create the
user and the membership together in one transaction. `PATCH /users/:id` updates
the membership; the existing self-guards ("you cannot change your own role",
"you cannot disable your own account") now compare membership role and still
guarantee one active admin per org. `DELETE /users/:id` removes the membership
(see open questions for the interaction with the global soft delete).

**11. Seed.** `wipe.ts` gains `org_memberships` and `organizations` (deleting
the org rows cascades most of the rest, but keep the explicit ordered deletes).
`run.ts` creates `{ name: "default org", slug: "default-org" }` and
`{ name: "second org", slug: "second-org" }`, runs the existing generators once
per org with the org's id (full volume for the first, a handful of clients for
the second), inserts a `welcome` template per org, seeds each org's staff, and
gives `ADMIN_EMAIL` an admin membership in both. Carriers are tenant-owned, so
each org gets its own copy of the carrier list. The seed connects with
`DATABASE_ADMIN_URL`. Row-count reporting stays but should group by org.

**12. Frontend.**
- `api/auth.ts`: `Me = { user, org, memberships }`, `Org`, `Membership` types;
  add `selectOrg(orgId)` → `POST /auth/org`.
- `AuthContext` carries `org` and `memberships` and exposes `selectOrg`, which
  refetches `me` and calls `queryClient.clear()` so no other org's cached rows
  survive a switch.
- `RequireAuth`: `!user` → `/login`; `user && !org` → `/select-org`. New
  `pages/SelectOrg.tsx` lists memberships as buttons (skipped entirely when
  there is exactly one, since the backend already bound the session). It sits
  outside `AppLayout`, like `/login`.
- `api/client.ts` needs no change — `ApiError.body` already surfaces the
  `code: "ORG_REQUIRED"` field; handle it in the query client's error path by
  routing to `/select-org`.
- `app-sidebar.tsx` shows the org name, with a switcher (a shadcn dropdown, the
  pattern `user-menu.tsx` already uses) listing the other memberships; hide the
  switcher for a single membership. Update `app-sidebar.stories.tsx`.
- `app-layout.tsx` sets `document.title = `${org.name} · CloudMS`` in an effect.

**13. Docs.** Rewrite `docs/multitenancy.md` so the design matches what was
built (membership model, session-bound org, RLS now, no migrations, per-org
numbering) and keep a short *Still open* section for the pieces this issue
pushes out. Update `docs/API.md` (the two new/changed `/auth` endpoints, the
users endpoints' membership semantics, invoice/receipt number fields, the
`AGENCY_NAME` sentence at line 864), `docs/AUTH_SESSIONS_EXPLAINED.md` (org on
the session, the picker, the 403 code), `PROJECT.md` (Current State's "Multi-
tenancy is designed but not built" and "Today the schema has no organization
yet", Direction item 2 trimmed to what is left), `CLAUDE.md` (the concurrent-
agent instructions name `npx tsx src/db/migrate.ts` as the safe command — that
becomes `db:bootstrap`, and `db:push` is *not* safe on the shared database, so
per-agent databases now need the two-URL recipe), and `backend/.env.example`.

## Tests

**Backend (vitest + TestContext).**
- `TestContext` gains an `org(name?)` builder and a lazily-created default org;
  every existing builder takes the context's `orgId`. `cleanup()` becomes a
  single `delete from organizations where id in (...)` (cascade) plus the
  existing user/email-log cleanup, since `users` is global and not cascaded.
  Keep the unique-suffix helpers — `users.email` is still globally unique.
- Every fixture write must run with `app.org_id` set, since the suite now
  connects as the `app` role: add a `runInOrg(orgId, fn)` helper in
  `testHelpers.ts` wrapping the same ALS context the middleware uses, and use it
  in the builders and in repository-level tests. Route tests go through
  supertest and get the context from the middleware for free.
- `makeSessionCookie(userId, orgId)` binds the session to an org.
- The `reminder_rules` unique becoming per-org removes the reason for
  `TestContext.reminderRule`'s random six-digit `offsetDays`; simplify that
  comment and default.
- **New `src/routes/crossTenant.test.ts`** — two orgs, one user with a
  membership in each (and one user with a membership in only the first). For
  every resource (clients, policies, vehicles, drivers/persons, carriers, logs,
  attachments, invoices, payments, receipts, trust ledger, templates, reminder
  rules, users, search): the list endpoint bound to org A excludes org B's rows,
  and `GET`/`PATCH`/`DELETE` of a B row with an A-bound session is a 404 (not a
  403 — the row must not be acknowledged). Plus a direct-repository case
  asserting an unscoped raw query under `app.org_id = A` returns no B rows,
  which is the RLS layer proving itself.
- **New `src/auth/org.test.ts`** — single membership auto-binds; two
  memberships yield a session with no org and a 403 `ORG_REQUIRED` on an app
  route; `POST /auth/org` with a non-membership org is 403; `/auth/me` shape;
  deactivating a membership kills only that org's sessions.
- Update `src/routes/users.test.ts` for membership semantics,
  `src/auth/auth.test.ts`, `src/jobs/reminders.test.ts` (now on `adminDb`, org
  from the policy, `{{agentName}}` from the org row), the accounting tests for
  invoice/receipt numbers, and the attachment tests for the new key prefix.
- Run: `cd backend && npm run typecheck && npm run lint && npm run format:check
  && npm test`. Per `CLAUDE.md`, do the destructive parts (push, seed) against a
  throwaway database created with `createdb -U postgres myapp_<agent>` and an
  inline `DATABASE_URL`/`DATABASE_ADMIN_URL`, never the shared `myapp`.

**Frontend.** `cd frontend && npm run lint && npm run build` (what CI runs).
Also run the Storybook/Vitest browser suite locally for the touched stories
(`app-sidebar`, `user-menu`) even though CI does not; add a story for the org
switcher's multi-membership state.

## Touches backend

yes

## Risks / open questions

**Risks**

- **Size.** Roughly 40 backend source files, ~25 backend test files and ~15
  frontend files change, and the suite is red between step 1 and step 6. Land it
  as one branch of ordered commits and expect the review to be long; splitting it
  across issues would leave `main` in a half-scoped state, which is worse.
- **Connection pinning vs pool size.** Holding a pool client for the duration of
  a request means `pg`'s default `max: 10` caps concurrent in-flight requests at
  10. Set `max` explicitly and make sure the release path runs on *every* exit
  (`finish` **and** `close`, plus the error middleware), or a single thrown
  handler leaks a connection and the API wedges. This is the highest-risk piece
  of the change and deserves its own test.
- **`drizzle-kit push` in production.** `push` is interactive when it detects a
  destructive statement, and `drizzle-kit` is a devDependency that the
  production image's `npm ci --omit=dev` stage removes. Verify the non-
  interactive flag for the pinned 0.31 and decide where push runs — inside the
  container CMD (needs drizzle-kit in the prod image) or as a deploy step in
  `ci.yml` before the container starts. The Dockerfile currently also does
  `COPY drizzle ./drizzle`, which must go.
- **RLS silently returning zero rows.** The failure mode of a missed
  `set_config` is "everything is empty", which reads like a data bug rather than
  a config bug. Log the org id on each request and add a startup assertion that
  the API is *not* connected as a superuser (superusers bypass RLS even with
  FORCE, so a misconfigured `DATABASE_URL` would make the whole backstop a
  no-op while every test still passes).
- **Existing R2 objects and dev data are orphaned.** Accepted by the issue, but
  worth stating in the PR: old `policy-attachments/...` keys have no matching
  rows after a push + seed.
- **`users.is_demo` leftover.** `docs/multitenancy.md` records that migration
  `0004` added a column that is no longer in `schema.ts`. Deleting `drizzle/`
  and pushing from `schema.ts` will now try to drop it — harmless, but it will
  show up in the push diff.

**Open questions**

1. **Per-request transaction or pinned connection?** Step 4 chooses the latter
   for the reasons given. If the literal `SET LOCAL`-in-a-transaction from the
   issue is required, PDF/R2 work has to move outside it first.
2. **`carriers.naic` and `auto_policies.policy_number`** are global uniques on
   tenant-owned tables; the issue only names `email_templates.key`. Making them
   per-org is assumed here (two agencies can legitimately write the same
   carrier, and a global collision leaks the existence of another org's row).
   Confirm.
3. **`DELETE /users/:id` semantics.** The plan removes the membership and
   leaves the global `users` row (with its audit FKs) alone. What should happen
   when that was the user's *last* membership — also set `users.deletedAt`, or
   leave a membership-less global row that can never sign in? The latter is
   simpler and is what this plan assumes.
4. **How the `app` role's password reaches the app.** Assumed: an
   `APP_DB_PASSWORD` env var read by `rls.ts` and embedded in the compose
   `DATABASE_URL`. Confirm there is no secret-management preference.
5. **Invoice number display format.** `docs/multitenancy.md` leaves "plain
   integer vs a per-agency prefix" open; this plan renders the plain integer.
6. **Slug uniqueness/validation.** `slug` is unique and set only by the seed and
   bootstrap in this issue, so no format validation is added. If the follow-up
   org-creation issue wants `/o/:slug/...`, a format check belongs there.

## Out of scope

Per the issue: creating organizations (no UI or API — only the seed and
`bootstrap.ts` create them); moving `MAIL_REPLY_TO`, `REMINDER_TIMEZONE` and
`REMINDER_SEND_HOUR` onto `organizations` and running the reminder planner per
org; org slug in the URL (`/o/:slug/...`) and two-orgs-in-two-tabs; the demo
org and everything that hangs off it (demo sign-in, org-scoped reseed, guardrail
settings, banner).

Also out of scope, implied by the above: a platform-admin role; self-serve
signup; retiring `ADMIN_EMAIL`; backfilling or migrating existing production
data (the issue accepts data loss); reintroducing generated migrations; and any
cross-org reporting.
