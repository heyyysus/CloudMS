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
- **`org_id NOT NULL`** on every domain table: persons, drivers, clients,
  client_phones, client_emails, carriers, auto_policies, vehicles,
  policy_drivers, policy_logs, policy_attachments, policy_log_attachments,
  invoices, invoice_items, payments, receipts, trust_ledger, email_templates,
  email_log, reminder_rules, scheduled_emails. Each gets a foreign key to
  `organizations` and a composite index led by `org_id`. #116 replaced
  migrations with `drizzle-kit push`, so there is no backfill migration:
  `org_id` carries a temporary column default of `1` (dropped in sub-issue 6),
  and `bootstrap.ts` creates organization 1 insert-if-absent so `db:push`
  followed by bootstrap has somewhere for existing rows to point. This means
  `db:push` against a database that already has rows fails until organization
  1 exists - fine for the fresh databases this repo's tooling targets, but a
  production rollout needs organization 1 inserted between two pushes; see
  #117's PR body.
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
- **Invoice and receipt numbers.** Today `invoices.id` and `receipts.id`
  double as the agency-wide sequential number. Under shared tables those
  serials interleave across agencies, so each agency's numbers would have
  gaps. Add `invoice_number` and `receipt_number` columns, unique per
  organization, allocated inside the creating transaction from a counter on
  the organization row. **Open:** the display format (plain integer vs a
  per-agency prefix).

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
- **Not done yet (sub-issues 4-6):** domain repositories and routes
  (clients, policies, accounting, etc.) still don't take an `orgId` - every
  domain row lands in one default organization via the temporary `org_id
  DEFAULT 1` regardless of which org's session created it. The *session's*
  org and the org domain rows land in are deliberately different things
  until that lands.
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
2. `org_memberships` table; `org_id` (temporary default 1) on every domain
   table with foreign keys and indexes; `bootstrap.ts` creates organization 1.
3. Thread `orgId` through every repository and route; `requireAuth` attaches
   the organization; `TestContext` gets a per-context organization. **Auth
   half done:** the session carries the org and `requireAuth`/`TestContext`
   enforce and provide it (see *Request scoping* above). **Repository/route
   half remains** (sub-issues 4-6): domain repositories and routes still
   don't take an `orgId`.
4. Per-organization invoice and receipt numbers.
5. Organization settings columns; move the agency-level environment variables
   onto them; scope the reminder planner per organization.
6. Organization creation and invite flow; retire `ADMIN_EMAIL`.
7. Demo org: flag, demo sign-in, org-scoped reseed, guardrail settings, banner.
8. Row-level security backstop.

## History

- 2026-08-30 to 2026-09-06: demo mode landed as a standalone deployment in
  #103, #105, #110 and #112 (#104 was reverted by #106 before this). All of
  it was reverted on 2026-09-19 in favor of the demo org above. The database
  column that #103 added (`users.is_demo`) was applied to production and the
  shared dev database by migration `0004`; that migration was removed with
  the revert, so the column may still exist as an unreferenced leftover until
  a later migration reuses or drops it.
