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

The rest of this document is the plan. None of it is implemented yet; it is
here so that work in flight lands on the same design. Sections marked **Open**
are decisions still to be made.

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
  plain nullable `varchar(22)`, with no backfill; #121 restores `NOT NULL`
  once every insert path passes an explicit `orgId`. Until then, `db:push`
  against a database that already has rows needs no organization to exist
  first - the column is nullable, not defaulted.
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
every insert for no benefit once the id is opaque anyway. `org_id` itself is
nullable until #121 (see *Data model* above) - unrelated to the id format,
but landing in the same migration since both touch every table's columns.

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
- **Not done yet (#121):** email templates, reminder rules, scheduled emails,
  the reminder planner/scheduler, and storage keys still don't take an
  `orgId` - since #130 dropped `org_id`'s temporary `DEFAULT 1`, every row
  created through those still-unscoped routes lands with `org_id NULL`
  regardless of which org's session created it, rather than in a single
  default organization. The *session's* org and the org those rows land in
  are deliberately different things until #121 lands.
- **Repositories take an explicit `orgId`.** All of them, so the compiler
  enforces scoping and a forgotten filter is a type error, not a data leak.
  The comment at the top of `backend/src/repositories/index.ts` anticipated
  exactly this. Cross-organization lookups do not exist in the API.
- **Row-level security as a backstop, later:** a non-superuser database role,
  `SET LOCAL app.org_id` at the start of each request transaction, and an RLS
  policy on every tenant table. This is defense in depth against a missed
  `where`, not the primary mechanism. The non-superuser `app` role already
  exists (the API, the scheduler and the test suite all connect as it) —
  only `SET LOCAL app.org_id` and the policies themselves remain.

## Organization settings replace environment variables

Anything that is really a property of the agency moves from the process
environment to columns on `organizations`: `AGENCY_NAME`, `MAIL_FROM`,
`MAIL_REPLY_TO`, `REMINDER_TIMEZONE`, `REMINDER_SEND_HOUR`, and the
reminder planning window. Outbound email sends from a shared platform domain
with the agency's reply-to; per-agency sending domains are a later problem.
Process-level configuration that stays in the environment: `DATABASE_URL`,
`GOOGLE_CLIENT_ID`, `RESEND_API_KEY`, `R2_*`, `APP_URL`, logging, and the
scheduler's tick and batch tuning.

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
4. Thread `orgId` through every repository and route; `requireAuth` attaches
   the organization; `TestContext` gets a per-context organization. **Auth
   half done:** the session carries the org and `requireAuth`/`TestContext`
   enforce and provide it (see *Request scoping* above). **Done (#119, #120):**
   people, clients, carriers, policies, vehicles, search, logs, attachments,
   and accounting documents take an explicit `orgId`. **Remains (#121):**
   email templates, reminder rules, scheduled emails, and storage keys.
5. **Done (#120):** per-organization invoice and receipt numbers.
6. Organization settings columns; move the agency-level environment variables
   onto them; scope the reminder planner per organization.
7. Organization creation and invite flow; retire `ADMIN_EMAIL`.
8. Demo org: flag, demo sign-in, org-scoped reseed, guardrail settings, banner.
9. Row-level security backstop (#122).

## History

- 2026-08-30 to 2026-09-06: demo mode landed as a standalone deployment in
  #103, #105, #110 and #112 (#104 was reverted by #106 before this). All of
  it was reverted on 2026-09-19 in favor of the demo org above. The database
  column that #103 added (`users.is_demo`) was applied to production and the
  shared dev database by migration `0004`; that migration was removed with
  the revert, so the column may still exist as an unreferenced leftover until
  a later migration reuses or drops it.
