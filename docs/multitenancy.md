# Multi-tenancy

**Decision (2026-09-19):** CloudMS ships as one multitenant deployment that
serves every agency. Agencies are *organizations* (rows in an `organizations`
table), every tenant-owned row carries an `org_id`, and every query is scoped
to the caller's organization. There is no per-agency instance, host, cluster,
namespace, database, or schema, and none is planned.

This is the standard shape for B2B SaaS at this scale, including the cloud
agency-management systems CloudMS competes with. A dedicated single-tenant
copy for one large customer remains possible later, because a multitenant
build with one organization in it *is* a single-tenant deployment; the reverse
is not true.

The rest of this document describes what is built. Sections marked **Open**
are decisions still to be made; the remaining rollout items not yet built are
called out where they appear.

## What was ruled out

- **An instance per agency** (a Compose stack, VM, or k3s namespace each):
  every onboarding becomes an infrastructure task, every migration, backup,
  cert, and upgrade runs N times, and "which version is agency X on" becomes a
  real question. It also rules out anything cross-tenant later, such as shared
  carrier data or aggregate AI features. The provisioning tooling alone would
  be a platform project ahead of every product item in `PROJECT.md`.
- **A schema or database per tenant** in one Postgres: the same N-times
  migration and backup problem, fragmented connection pools, and no real
  support in Drizzle.
- **Kubernetes** as a prerequisite: the existing Compose stack, with Postgres
  moved to a managed service for backups, carries the product well past dozens
  of agencies. Running two `app` containers behind nginx is the first scaling
  step; the reminder scheduler already tolerates that.

## Data model

- **`organizations`** — `id`, `name`, `slug`, settings columns (below),
  `is_demo` (see *Demo org*), timestamps.
- **`org_id`** on every domain table: persons, drivers, clients,
  client_phones, client_emails, carriers, auto_policies, vehicles,
  policy_drivers, policy_logs, policy_attachments, policy_log_attachments,
  invoices, invoice_items, payments, receipts, trust_ledger, email_templates,
  email_log, reminder_rules, scheduled_emails. Each gets a foreign key to
  `organizations` and a composite index led by `org_id`. #116 replaced
  migrations with `drizzle-kit push`, so there is no backfill migration.
  #130 dropped the column's temporary `NOT NULL DEFAULT 1` (a leftover from
  when ids were sequential integers and `1` meant something) in favor of a
  plain nullable `varchar(22)`, with no backfill. **Done (#121):** `org_id`
  is `NOT NULL` again, with no default, on every tenant table - a one-off
  `db:backfill-org` script assigns any legacy `NULL` row to the default
  organization (or derives it from the row's parent) before `drizzle-kit
  push` emits the `SET NOT NULL`, so an insert without `org_id` now fails at
  the database rather than landing invisibly.
- **Multiple users can belong to one organization, and one user can belong to
  multiple organizations** via an `org_memberships` table (`user_id`, `org_id`,
  `role`, `is_active`, unique on `(user_id, org_id)`) rather than an `org_id`
  column on `users`. This answers the question this section used to leave
  **Open**. `users.role` is gone as of sub-issue 3: `org_memberships.role` is
  the only source of a user's role, and it can differ per organization.
  `users.email` stays globally unique - one user row, looked up by email at
  login, with a membership (and role) per organization it belongs to.
- **Global uniques become per-organization:** `email_templates.key` →
  `(org_id, key)`, and the bootstrap `welcome` template is inserted per
  organization when the organization is created.
- **Done (#120): invoice and receipt numbers.** `invoices.invoice_number` and
  `receipts.receipt_number` are plain integers, unique per organization,
  allocated inside the creating transaction from `organizations.next_invoice_number`
  / `next_receipt_number` (a row-locking `UPDATE ... RETURNING`, so a rolled-back
  create does not burn a number). The display format is a plain integer, with
  no per-agency prefix. Row `id` is unaffected and stays what URLs and query
  keys use; `invoiceNumber`/`receiptNumber` ride alongside `id` in API
  responses and are what PDFs and policy-log entries print instead of the
  opaque row id.

### Row ids

**Done (#130):** every table's primary key and every foreign key is an
opaque 22-character base64url string (`^[A-Za-z0-9_-]{22}$`), replacing
sequential `serial` ids. A sequential id leaks volume (agency size, growth
rate) to anyone who can see one, and once rows from multiple organizations
share the same tables, it also leaks relative signup order across tenants -
exactly the kind of cross-tenant inference this rollout exists to close.
Generation is belt-and-braces: a Postgres column `DEFAULT` (pgcrypto's
`gen_random_bytes(16)`, base64url-encoded) so a raw `INSERT` from any path
still gets a valid id, plus a Drizzle `$defaultFn` (Node's
`randomBytes(16).toString("base64url")`) so an id is already present on the
in-memory row before `.returning()` completes. A flat random id was chosen
over a composite `<org>-<sequence>` key: the latter still leaks per-org
volume to anyone in that org and adds a second read (or a cached counter) on
every insert for no benefit once the id is opaque anyway. `org_id` itself was
nullable in the same migration, and restored to `NOT NULL` by #121 (see *Data
model* above) - unrelated to the id format, but the two landed together since
both touch every table's columns.

## Request scoping

- **Done (sub-issue 3):** the session is the only source of the tenant - never
  the URL, a header, or the body. `sessions.org_id` holds it; `POST
  /auth/google` binds it at sign-in when the user has exactly one active
  membership (leaves it unbound, and 403s with zero); `POST /auth/org`
  re-binds an existing session to any org the caller is an active member of.
  `requireAuth` attaches `req.orgId` and `req.membership` (403ing with
  `code: "ORG_REQUIRED"` when the session has no org, or the membership was
  deactivated mid-session) for every route outside `/auth/*`, which use
  `requireSession` instead since the org picker has to work before a session
  is bound. `TestContext` gets a per-context organization and org-aware
  `user()`/`cookie()` helpers.
- **Done (#119), first half:** people, clients (with phones/emails),
  carriers, auto policies, vehicles, and search take an explicit `orgId` and
  filter every read/write by it; a row in another organization is invisible,
  answering exactly as a missing row does. `carriers.naic` and
  `auto_policies.policy_number` are unique per organization rather than
  globally.
- **Done (#120), second half:** policy logs, policy attachments,
  log-attachment links, invoices, payments, receipts, and the trust ledger
  take an explicit `orgId` and filter every read/write by it, exactly like
  the #119 half. `policyActivities.ts` resolves the policy through the
  org-scoped `findAutoPolicyById` before reading `listScheduledEmails`, so
  the one cross-tenant read there is closed without pulling #121's scope
  forward. Attachment storage keys are now prefixed `org/<org_id>/policies/...`;
  attachments uploaded before this change keep their old
  `policy-attachments/...` key and are not migrated.
- **Done (#121):** email templates, email log, reminder rules, and scheduled
  emails take an explicit `orgId` and filter every read/write by it, exactly
  like the #119/#120 halves. The reminder planner's `INSERT ... SELECT` joins
  `reminder_rules` to `auto_policies` within the same organization
  (`p.org_id = r.org_id`), which is what stops a rule in one org from
  queuing reminders against another org's policies; the dispatcher and
  manual `POST /reminders/tick` carry the same org filter. The automation
  user that authors these sends stays a single global row with no
  memberships, looked up through `adminDb`, and never determines the `org_id`
  written - that always comes from the policy or rule the send concerns.
  `organizations.name` replaces `AGENCY_NAME` in `{{agentName}}`. Storage keys
  were already scoped in #120, not left for #121 as an earlier draft of this
  document said.
- **Repositories take an explicit `orgId`.** All of them, so the compiler
  enforces scoping and a forgotten filter is a type error, not a data leak.
  The comment at the top of `backend/src/repositories/index.ts` anticipated
  exactly this. Cross-organization lookups do not exist in the API.
- **Done (#122): row-level security as a backstop.** Isolation layer 1 is
  every repository filtering by an explicit `orgId`; layer 2 is Postgres
  itself refusing to show the non-superuser `app` role rows outside the
  current org, so a repository call that forgot its `where` still can't leak
  data. `backend/src/db/rls.ts` runs after `roles.ts` on every `db:push` and,
  for each of the 21 tenant tables listed there, idempotently enables and
  *forces* row-level security and creates a `FOR ALL` policy of `org_id =
  current_setting('app.org_id', true)` for both `USING` and `WITH CHECK`. A
  request that sets no `app.org_id` sees zero rows, not an error and not
  everything — that's what makes RLS a backstop rather than an opt-in. A
  completeness check in the same file queries `information_schema.columns`
  for any `public` table with an `org_id` column and throws if it isn't in
  the tenant list (or the deliberately-unprotected `users` / `sessions` /
  `org_memberships` / `organizations`), so a new tenant table can't go live
  unpolicied. `FORCE ROW LEVEL SECURITY` also binds the table *owner*, so
  this only holds because `DATABASE_ADMIN_URL` is a superuser in every
  environment this repo runs in; `ALTER ROLE ... BYPASSRLS` on the owner role
  is the mitigation if that ever changes.

  `organizations` is deliberately **not** RLS-protected, alongside `users`,
  `sessions`, and `org_memberships`: `GET /auth/me` and the org picker read
  it under `requireSession`, before any org context exists, so a row policy
  keyed on `app.org_id` would 404 the picker itself. All four tables are
  reached only through the auth layer, never through a repository that might
  forget an `org_id` filter, so RLS has nothing to backstop there.

  A request carries its org into the database as a transaction, not a
  per-statement setting: `requireAuth` (`backend/src/auth/middleware.ts`)
  opens `runInOrg(req.orgId, ...)` around the rest of the request once the
  session and membership are resolved, which starts a transaction on the
  `app`-role pool, sets `app.org_id` on it with `set_config(..., true)` (the
  same trick `roles.ts` uses, since `SET` takes a literal, not a bind
  parameter), and stores it in an `AsyncLocalStorage`
  (`backend/src/db/context.ts`). The `db` that every repository already
  imports is a `Proxy` that resolves to that stored transaction when one is
  open and to the plain `app`-role pool otherwise, so none of the ~40
  existing `import { db } from "../db"` call sites changed. The transaction
  commits when the response finishes sending (on `res`'s `"close"` event, so
  it also covers an aborted connection), which means one in-flight request
  now pins one pooled connection for its full duration, including any
  external I/O the handler does; `DB_POOL_MAX` (default 20, `.env.example`)
  is the resulting concurrency cap, sized against Postgres's own
  `max_connections`. A repository or route calling `db.transaction(...)`
  inside a request becomes a savepoint on that same connection, which is the
  correct semantics for the repositories that already nest transactions
  (`payments`, `invoices`, `autoPolicies`, `clients`, ...). Code with no
  request to hang a transaction off of — a script, a test calling a
  repository directly — calls `runInOrg(orgId, fn)` itself; `TestContext`'s
  fixture builders do this so ordinary repository tests don't have to.

  `adminDb` (`backend/src/db/pools.ts`) is the table-owner role and bypasses
  RLS entirely; it stays reserved for schema push, role grants,
  bootstrap/seed, and the reminder planner/dispatcher (a background job has
  no request-scoped org context, so its own `p.org_id = r.org_id`-style joins
  are what prevent cross-tenant reads there, not RLS). An ESLint rule
  (`backend/eslint.config.js`) blocks importing `adminDb` from anywhere
  outside `src/db/**`, `src/jobs/**`, `src/routes/testHelpers.ts`, and
  `*.test.ts` files, so the boundary is enforced, not just documented.

  Two suites prove this end to end: `backend/src/db/rls.test.ts` runs a
  hand-written query with no `org_id` filter at all inside an org context and
  confirms another org's row is invisible (while the same query on `adminDb`
  sees both), and confirms `SELECT` on a tenant table with no org context set
  returns zero rows — the one place a global row-count assertion is
  legitimate, since RLS makes it deterministically zero regardless of
  concurrent workers. `backend/src/routes/crossTenant.test.ts` drives a
  table of every org-scoped HTTP endpoint (list/detail/create-with-parent, or
  an `exempt` entry with a written reason) with an org-A cookie against
  org-B's fixtures, and separately walks the app's registered routes to
  assert every one of them has an entry, so a new route without cross-tenant
  coverage fails the build.

  A commit landing after the response is already on the wire is a known,
  accepted trade-off: a `201` can reach the client moments before `COMMIT`
  returns, so a commit failure that only shows up then (a lost connection, a
  serialization failure) means the client was told about a write that did
  not durably happen. The alternative — a pinned connection with
  session-level `SET` and autocommit per statement — gives up request
  atomicity to close that gap, which is worse. A pg error a handler lets
  escape aborts the transaction; Postgres turns the subsequent `COMMIT` into
  a no-op `ROLLBACK` without raising, so the request's earlier writes are
  correctly discarded and `requireAuth`'s wrapper just logs it.

## Organization settings replace environment variables

Anything that is really a property of the agency moves from the process
environment to columns on `organizations`. **Done (#121):** `organizations.name`
replaces `AGENCY_NAME`, which no longer exists as an environment variable.
**Remains:** `MAIL_FROM`, `MAIL_REPLY_TO`, `REMINDER_TIMEZONE`,
`REMINDER_SEND_HOUR`, and the reminder planning window stay process-wide for
now - #121 explicitly left these for a later issue, since none of them can
change per request the way `agentName` does. Outbound email sends from a
shared platform domain with the agency's reply-to; per-agency sending domains
are a later problem. Process-level configuration that stays in the
environment: `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `R2_*`,
`APP_URL`, logging, and the scheduler's tick and batch tuning.

Object storage keys are generated server-side as `org/<org_id>/...`, so an
attachment can never be addressed across organizations. The reminder planner
iterates organizations and honors each one's timezone and send hour.

## Onboarding

Creating an agency is an application action, not an infrastructure task: a
platform-level admin creates the organization and invites its first admin,
who then invites staff exactly as today. `ADMIN_EMAIL` bootstrap goes away
once that flow exists. **Open:** whether a platform-admin flag on `users`
is enough, or whether self-serve signup (create your own organization) is
wanted for launch.

## Demo org

The demo is an organization, not a deployment. The previous demo mode
(`DEMO_MODE=true`, a separate host, its own Compose file and database) was
reverted because it assumed a standalone instance and would have had to be
rebuilt anyway once tenants exist.

- One organization flagged `is_demo = true` lives in the production
  database alongside real agencies.
- Demo sign-in mints a short-lived user *inside that organization* with no
  Google token; it is unavailable for every other organization.
- The reseed job wipes and regenerates that organization's rows only, on a
  schedule, and preserves demo users mid-session. Nothing it does can touch
  another organization, because it runs through the same org-scoped
  repositories as everything else.
- Guardrails (row ceilings, no outbound email, no attachment uploads) are
  organization settings that happen to be set on the demo org, not process
  flags.
- The frontend shows the demo banner when the current user's organization is
  the demo org, from `GET /auth/me`, not from a public config endpoint.

**Open:** reset cadence, and whether the demo org is seeded once by hand or
created automatically by a migration.

## Rollout order

1. `organizations` table.
2. `org_memberships` table; `org_id` on every domain table with foreign keys
   and indexes; `bootstrap.ts` creates a default organization.
3. **Done (#130):** opaque 22-character row ids on every table, replacing
   sequential `serial` ids, and `org_id` dropped to nullable (no default) -
   see *Row ids* above. Runs before the next step so repositories, tests and
   the frontend are rewritten for the new id type once, not twice.
4. **Done.** Thread `orgId` through every repository and route; `requireAuth`
   attaches the organization; `TestContext` gets a per-context organization.
   The session carries the org and `requireAuth`/`TestContext` enforce and
   provide it (see *Request scoping* above). **Done (#119, #120):** people,
   clients, carriers, policies, vehicles, search, logs, attachments, and
   accounting documents take an explicit `orgId`. **Done (#121):** email
   templates, email log, reminder rules, scheduled emails, and the reminder
   planner/dispatcher take an explicit `orgId`; `org_id` is `NOT NULL` again
   on every tenant table.
5. **Done (#120):** per-organization invoice and receipt numbers.
6. Organization settings columns; move the agency-level environment variables
   onto them; scope the reminder planner per organization. **Partially done
   (#121):** `organizations.name` replaces `AGENCY_NAME`. `MAIL_REPLY_TO`,
   `REMINDER_TIMEZONE`, `REMINDER_SEND_HOUR` and per-organization planner
   scoping remain.
7. Organization creation and invite flow; retire `ADMIN_EMAIL`.
8. Demo org: flag, demo sign-in, org-scoped reseed, guardrail settings, banner.
9. **Done (#122):** row-level security backstop — see *Request scoping*
   above.

## History

- 2026-08-30 to 2026-09-06: demo mode landed as a standalone deployment in
  #103, #105, #110 and #112 (#104 was reverted by #106 before this). All of
  it was reverted on 2026-09-19 in favor of the demo org above. The database
  column that #103 added (`users.is_demo`) was applied to production and the
  shared dev database by migration `0004`; that migration was removed with
  the revert, so the column may still exist as an unreferenced leftover until
  a later migration reuses or drops it.
