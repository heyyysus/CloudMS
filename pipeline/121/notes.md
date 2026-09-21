---
issue: 121
status: in-progress
---
# Implementation notes — issue #121

## Implemented

- `backend/src/db/backfillOrgIds.ts`: idempotent one-off backfill, guarded so it
  no-ops on a genuinely fresh database (tables don't exist yet before the
  first `drizzle-kit push`). Wired into `Dockerfile`'s CMD chain and
  `package.json`'s `db:backfill-org`.
- `backend/src/db/schema.ts`: `org_id` is `.notNull()` on all 21 tenant
  tables; `reminder_rules_trigger_offset_unique` is now per-org
  `(org_id, trigger, offset_days)`.
- Repositories `emailTemplates.ts`, `emailLog.ts`, `reminderRules.ts`,
  `scheduledEmails.ts`: `orgId` first parameter, filtered reads, `orgId` set
  on every insert. `repositories/index.ts` header rewritten to name the five
  global exceptions plainly instead of forward-referencing sub-issues.
- Routes `emailTemplates.ts`, `correspondenceTemplates.ts`, `reminderRules.ts`,
  `mail.ts`, `policyActivities.ts`, `users.ts`: thread `req.orgId!`.
- `emails.ts`: `sendWelcomeEmail(orgId, ...)`, `sendCorrespondenceEmail({orgId, ...})`.
- Jobs: `automationUser.ts` looks up through `adminDb`; `config.ts`'s
  `agencyIdentity` takes the organization instead of reading `AGENCY_NAME`;
  `planner.ts` carries `org_id` through the INSERT...SELECT, joins
  `auto_policies` within the same org, takes an optional `orgId` filter, and
  runs through `adminDb`; `dispatcher.ts` drops the null-org fallback,
  `claimBatch`/`releaseStaleClaims` take an optional `orgId`, and direct
  queries run through `adminDb` (repository calls stay on `db`, already
  org-scoped); `scheduler.ts`'s `runReminderTickNow(orgId)`.
- `bootstrap.ts`: removed the automation user's default-org membership insert.
- `testHelpers.ts`: `ctx.template()`/`ctx.reminderRule()` take an optional
  `orgId`; `cleanup()` sweeps `email_log` by org (catches automation-user
  sends) alongside the existing `email_templates` org sweep.

## Decisions

- `invoices` isn't listed in the plan's root-table list or its child-table
  list, but it carries a NOT NULL `policy_id`, so the backfill script derives
  its org from `auto_policies` the same way `policy_logs`/`vehicles`/etc do,
  rather than defaulting it to the default org.
- `trust_ledger.invoice_id` is nullable (unlike `payments`/`receipts`), so the
  backfill derives `trust_ledger`'s org from `auto_policies` via `policy_id`
  (always set) instead of from `invoices` as the plan's prose suggests -
  deriving from `invoices` would strand any row whose `invoice_id` is null.
- The backfill script checks `information_schema.tables` before touching each
  table (and exits immediately if `organizations` doesn't exist yet). The plan
  says it must run before `drizzle-kit push`, but on a genuinely fresh
  deployment no tables exist at all until push runs - a literal
  "backfill first" would crash the very first boot. The guard makes it a
  true no-op in that case and only does real work on an upgrade of an
  existing database.

## Deviations from plan

- Not creating a new `routes/reminderRules.test.ts`. All existing
  reminder-rules/scheduled-emails route tests already live in
  `jobs/reminders.test.ts` (not in a separate routes test file) - that file's
  own header comment explains why the planner/dispatcher tests must stay
  together, and splitting only the reminder-rules CRUD tests out would
  fragment coverage of routes that are otherwise tested end-to-end in one
  place. New wrong-org cases were added to the existing describe blocks there
  instead.

## For the docs stage / reviewer

- `PROJECT.md`'s Current State paragraph still says "there is no
  `organizations` table" - stale since sub-issue 1, not this issue's job to
  fix (per plan).
- The jobs (planner/dispatcher) now run through `adminDb`, the owner role,
  ahead of row-level security (#122/sub-issue 8). Until RLS lands, the
  planner's own `p.org_id = r.org_id` join is what prevents cross-tenant
  reminders, not a database-level backstop.

## Checks run

(fill in as work proceeds)
