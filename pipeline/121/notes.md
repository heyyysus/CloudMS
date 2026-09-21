---
issue: 121
status: done
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
- Tests: wrong-org cases for `GET/POST/PATCH/DELETE /reminder-rules`,
  `GET /scheduled-emails`, and `POST /scheduled-emails/:id/cancel` (404, not
  409, for another org's row); a per-org-uniqueness test that two
  organizations can use the same `(trigger, offsetDays)`; a two-org planner
  test asserting `planDueReminders()` never joins a rule to another org's
  policy (2 rows total, not 4, for two orgs sharing an offset); a matching
  two-org dispatch test asserting each org's `email_log` row carries its own
  `org_id` and `{{agentName}}` renders its own org's name; a manual-tick
  test asserting `POST /reminders/tick` only plans/dispatches the caller's
  org (another org's due-but-unplanned rule produces nothing, and another
  org's already-pending row is left untouched); and a new
  `backend/src/db/schema.test.ts` asserting a raw insert into a tenant table
  with no `org_id` is rejected by the database. `docs/API.md`,
  `docs/multitenancy.md`, `backend/.env.example` and `backend/src/db/index.ts`'s
  role-split comment updated for `AGENCY_NAME` removal, `org_id NOT NULL`,
  and jobs running through `adminDb`.

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
  reminders, not a database-level backstop. Documented in
  `docs/multitenancy.md` and `backend/src/db/index.ts`'s comment.
- **Open risk carried over from plan.md, not resolved here:** what the
  *production* database actually holds in `org_id` needs checking before this
  backfill runs there. #117 added `org_id NOT NULL DEFAULT 1` when ids were
  sequential integers; #130 switched ids to opaque 22-char strings and
  dropped that default. If any production row still holds a stale `'1'`
  (rather than `NULL`), it is a dangling FK value that `backfillOrgIds.ts` as
  written will *not* touch (it only ever updates `org_id is null`), and the
  `SET NOT NULL` in `drizzle-kit push` would then succeed while that row
  points at a nonexistent organization. Before running this in production,
  run this pre-flight per tenant table and confirm every value is either
  `NULL` (which the backfill handles) or a real `organizations.id`:
  ```sql
  select org_id, count(*) from <table> group by 1 order by 2 desc;
  ```
  This CI/scratch database was created fresh for this task, so it never held
  a stale `'1'` and this risk did not surface here - it is untested against
  real production data by this pipeline run.

## Checks run

All from `backend/`, against a scratch database created for this task
(`DATABASE_URL`/`DATABASE_ADMIN_URL` supplied by the runner, not the shared
dev database):

- `npm run db:backfill-org` (no-op: fresh database, no tables yet) then
  `npm run db:push` then `npm run db:bootstrap` - clean push, no leftover
  interactive prompts once the database was fresh.
- `npm run typecheck` - clean.
- `npm run lint` - clean.
- `npm run format` / `npm run format:check` - clean (two files needed
  reformatting, fixed).
- `npm test` - 469 tests passed, 35 files, including the new wrong-org,
  per-org-uniqueness, two-org scheduler, manual-tick-scope, and
  `org_id NOT NULL` coverage.
- `npm run build` - clean.
- `grep -rn AGENCY_NAME --exclude-dir=pipeline .` - only doc mentions of the
  now-removed variable by name remain (`docs/multitenancy.md`); no code or
  `.env.example` references.
- No `frontend/` changes; none expected per plan.

## Docs

`docs/API.md`, `docs/multitenancy.md`, and `backend/.env.example` were already
updated for #121 in an earlier commit on this branch (org-scoped rules/queue,
`org_id NOT NULL` + backfill, `AGENCY_NAME` → `organizations.name`, rollout
checklist). Reviewed them against the final diff and found nothing stale or
missing. No changes needed to `README.md`, `docs/AUTH_SESSIONS_EXPLAINED.md`,
or `docs/frontend-ui-design.md` - no auth/session, UI, or setup-step changes
in this issue, and `AGENCY_NAME`/`db:backfill-org` aren't referenced in
`README.md`.
