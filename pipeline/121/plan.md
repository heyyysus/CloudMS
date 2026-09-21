---
issue: 121
status: pending-review
---
# Org-scope email, reminders and the scheduler; `organizations.name`; restore `org_id NOT NULL`

## Goal

The last domain slice of sub-issue 4's "thread `orgId` through every
repository" work, plus the background jobs, plus closing the schema loop.

Done means:

1. `repositories/emailTemplates.ts`, `emailLog.ts`, `reminderRules.ts` and
   `scheduledEmails.ts` take `orgId` as their first parameter, filter every
   read by it, set `org_id` on every insert, and answer a row in another
   organization exactly as a missing row (404 / `[]`) — the same rule #119 and
   #120 established. Their routes (`emailTemplates.ts`,
   `correspondenceTemplates.ts`, `reminderRules.ts`, `mail.ts`) and the
   send layer (`emails.ts`, `mailer.ts` call sites) pass `req.orgId!` through.
2. The automation user stays one global `users` row with **no** memberships,
   looked up through `adminDb`. Everything it writes (`policy_logs`,
   `email_log`, `scheduled_emails`) takes `org_id` from the policy or rule it
   concerns, never from a session.
3. `jobs/planner.ts` and `jobs/dispatcher.ts` carry `org_id` through
   `scheduled_emails`; the planner joins rules to policies **within the same
   org**; `POST /reminders/tick` stays admin-only and plans/dispatches for the
   caller's org only.
4. `organizations.name` replaces `AGENCY_NAME` in `{{agentName}}` on automated
   sends. `AGENCY_NAME` no longer appears anywhere in the repo.
   `MAIL_REPLY_TO`, `REMINDER_TIMEZONE` and `REMINDER_SEND_HOUR` stay in the
   environment (a later issue moves them).
5. `org_id` is `NOT NULL` with no default on every tenant table, after
   existing `NULL` rows are backfilled; any leftover database-side default on
   `invoice_number` / `receipt_number` is gone. An insert without `org_id`
   fails at the database.
6. Bootstrap inserts the welcome template per organization (already true) and
   the automation user's default-org membership is removed.
7. Backend suite green, including wrong-org cases for templates, reminder
   rules and mail, and a two-org scheduler test.
8. `docs/API.md`, `docs/multitenancy.md` and `backend/.env.example` updated.

## Scope check

Roadmap item 2 in `PROJECT.md` ("organization-scoped repositories …
organization settings in place of agency-level environment variables"), and
`docs/multitenancy.md` rollout step 4's final part plus the first slice of
step 6. It is the direct continuation of #119 (people/clients/carriers/
policies/vehicles/search) and #120 (logs/attachments/accounting), and reuses
their patterns verbatim: `orgId` first, filter in the `where`, set on insert,
`CrossOrgReferenceError` for a caller-supplied parent FK in another org, and
`ctx.org()` fixtures.

Triage labels look right: `enhancement`, `area:backend`,
`pipeline:needs-plan`. The change is backend-only — the frontend keeps calling
the same endpoints with the same shapes; sub-issue 9 owns any frontend work.
`agent` is harmless but carries no meaning here.

One acceptance criterion needs reading with judgement — see *Risks* below:
"every repository module takes `orgId` as its first parameter" cannot be true
of `users.ts`, `sessions.ts`, `organizations.ts`, `orgMemberships.ts` or
`errors.ts`, which are global by design.

## Files / areas

**Schema** — `backend/src/db/schema.ts`

- Drop the `// Nullable until #121 …` comment and add `.notNull()` to `orgId`
  on all 21 tenant tables: `emailTemplates` (128), `emailLog` (153),
  `reminderRules` (184), `scheduledEmails` (225), `persons` (269), `drivers`
  (296), `clients` (316), `clientPhones` (353), `clientEmails` (373),
  `carriers` (396), `autoPolicies` (420), `vehicles` (460), `policyDrivers`
  (495), `policyLogs` (521), `policyAttachments` (560), `policyLogAttachments`
  (600), `invoices` (678), `invoiceItems` (718), `payments` (743), `receipts`
  (783), `trustLedger` (831).
- **Do not** touch `sessions.orgId` (line 109) — a session is deliberately
  unbound until `POST /auth/org` picks an org. `orgMemberships.orgId` is
  already `.notNull()`.
- Replace `unique("reminder_rules_trigger_offset_unique").on(trigger,
  offsetDays)` (line 202) with a per-org unique on `(orgId, trigger,
  offsetDays)`. Keep the constraint *name* or rename it deliberately — the
  name is matched by `isPgUniqueViolation` in `routes/reminderRules.ts`.
- Confirm `invoices.invoiceNumber` (682) / `receipts.receiptNumber` (787)
  carry no `.default()` / identity in the schema (they don't today) and no
  leftover default in the live database (see Approach step 2).

**One-off backfill** — new `backend/src/db/backfillOrgIds.ts`

Must run *before* `drizzle-kit push` (push emits the `SET NOT NULL`), so it
cannot rely on `bootstrap.ts` having run. Add `db:backfill-org` to
`backend/package.json` and wire it into `backend/Dockerfile`'s `CMD` chain
between `extensions.js` and `drizzle-kit push`.

**Repositories** (all get `orgId` as first parameter)

- `backend/src/repositories/emailTemplates.ts` — `findEmailTemplateByKey`,
  `listCorrespondenceTemplates`, `findCorrespondenceTemplateById`,
  `createCorrespondenceTemplate`, `updateCorrespondenceTemplate`,
  `deleteCorrespondenceTemplate`; `upsertEmailTemplate` already takes `orgId`
  in its input object — move it to a leading parameter for consistency.
- `backend/src/repositories/emailLog.ts` — `createEmailLogEntry`,
  `listEmailLogEntries` (currently unexercised by any caller; scope it anyway
  so the acceptance grep is clean).
- `backend/src/repositories/reminderRules.ts` — `listReminderRules`,
  `findReminderRuleById`, `createReminderRule`, `updateReminderRule`,
  `deleteReminderRule`.
- `backend/src/repositories/scheduledEmails.ts` — `listScheduledEmails`,
  `findScheduledEmailById`, `cancelScheduledEmail`.
- `backend/src/repositories/index.ts` — rewrite the header comment: this
  sub-issue is the last one, so it can state the rule plainly and name the
  global exceptions instead of forward-referencing sub-issues.

**Routes**

- `backend/src/routes/emailTemplates.ts`, `correspondenceTemplates.ts`,
  `reminderRules.ts`, `mail.ts` — thread `req.orgId!`.
- `backend/src/routes/policyActivities.ts` — `listScheduledEmails` now takes
  `orgId`; keep the `findAutoPolicyById` pre-check (it is still the source of
  the 404 for a missing policy) and simplify the comment #120 left there.
- `backend/src/routes/users.ts` — three `sendWelcomeEmail` call sites pass
  `req.orgId!`.

**Send layer**

- `backend/src/emails.ts` — `sendWelcomeEmail(orgId, user, invitedBy, role)`
  and `sendCorrespondenceEmail({ orgId, … })`; both write `email_log` rows.
- `backend/src/mailer.ts` — expected to need **no** change: it reads
  `RESEND_API_KEY` / `MAIL_FROM` / `MAIL_REPLY_TO`, all process-wide by the
  issue's own carve-out. Verify rather than assume.

**Jobs**

- `backend/src/jobs/automationUser.ts` — look up through `adminDb`.
- `backend/src/jobs/config.ts` — `agencyIdentity` takes the organization
  instead of reading `AGENCY_NAME`.
- `backend/src/jobs/planner.ts` — `org_id` in the `INSERT … SELECT`, same-org
  join, optional org filter for the manual tick.
- `backend/src/jobs/dispatcher.ts` — drop `resolveOrgId`'s null fallback,
  optional org filter in `claimBatch`, resolve the org for `agencyIdentity`.
- `backend/src/jobs/scheduler.ts` — `runReminderTickNow(orgId)`.

**Bootstrap / seed**

- `backend/src/db/bootstrap.ts` — remove the automation user's
  `org_memberships` insert (lines 56–64 keep only the admin membership above
  it); everything else already passes `defaultOrgId`.
- `backend/src/db/seed/run.ts` — already seeds a welcome template per org;
  verify only.

**Tests**

- `backend/src/routes/testHelpers.ts` — `ctx.template()` and
  `ctx.reminderRule()` take/default an org; `cleanup()` re-checked (see
  Tests).
- Existing: `routes/emailTemplates.test.ts`, `correspondenceTemplates.test.ts`,
  `mail.test.ts`, `src/emails.test.ts`, `jobs/reminders.test.ts`.
- New: `routes/reminderRules.test.ts` (there is no such file today) and the
  two-org scheduler case inside `jobs/reminders.test.ts`.

**Docs / config**

- `backend/.env.example` — delete the `AGENCY_NAME` block (lines 21–23).
- `docker-compose.yml` — the app service uses `env_file: .env` and sets no
  `AGENCY_NAME` explicitly, so there is nothing to remove; confirm and move on.
- `docs/API.md` — the reminders section (~line 936) says `{{agentName}}`
  renders `AGENCY_NAME`; change to the organization's name. Also update the
  `(trigger, offsetDays)` uniqueness sentence (~line 928) to per-organization,
  and note that templates, rules and the queue are organization-scoped.
- `docs/multitenancy.md` — move the "Not done yet (#121)" bullet into the Done
  list, mark rollout step 4 complete and step 6 partially done, update the
  *Data model* `org_id` paragraph now that `NOT NULL` is back, and correct the
  stale "storage keys still don't take an `orgId`" clause (#120 did those).
- `PROJECT.md` — the Current State paragraph still says "Multi-tenancy is
  designed but not built: there is no `organizations` table". That is wrong as
  of sub-issue 1 and is not this issue's job to fix, but flag it in the
  implementation notes so a later docs pass catches it.

## Approach

1. **Backfill first, schema second.** Write `db/backfillOrgIds.ts` before
   touching `schema.ts`, because `db:push` will fail against any database
   holding a `NULL`. It runs on `adminDb`, is idempotent, and only ever
   touches rows where `org_id is null`:
   - Ensure the default organization exists (`slug = "default-org"`,
     `onConflictDoNothing`), exactly as `bootstrap.ts` does — the script runs
     before bootstrap in the container chain, so it cannot assume one exists.
   - For tables with an org-bearing parent, derive the value rather than
     guessing: `scheduled_emails` from its `auto_policies` row,
     `invoice_items` from `invoices`, `payments`/`receipts`/`trust_ledger`
     from `invoices`, `policy_logs` / `policy_attachments` /
     `policy_log_attachments` / `vehicles` / `policy_drivers` from
     `auto_policies`, `client_phones` / `client_emails` from `clients`,
     `drivers` from `persons`. A single `update … from … where t.org_id is
     null` per table.
   - For root tables with no parent (`persons`, `clients`, `carriers`,
     `auto_policies`, `email_templates`, `email_log`, `reminder_rules`),
     assign the default org. These are pre-multitenancy rows; the default org
     is what `bootstrap.ts` already treats as their home.
   - `email_templates` is the one table where the backfill can collide: the
     `(org_id, key)` unique means an orphan `welcome` row backfilled into the
     default org clashes with the bootstrapped one. Delete the orphan when a
     row with the same `(default org, key)` already exists, otherwise adopt it.
   - Log a per-table count so the production run is auditable.

2. **Schema.** Add `.notNull()` to the 21 columns, switch the reminder-rule
   unique to `(org_id, trigger, offset_days)`, and check the live database for
   leftover column defaults before/after push:
   `select table_name, column_name, column_default, is_nullable from
   information_schema.columns where column_name in ('org_id','invoice_number','receipt_number')`.
   #120 dropped the identity on the two number columns via push, so this is
   expected to be a confirmation; drop anything that survived.
   Run `db:push` **only against your own scratch database** (CLAUDE.md) — this
   is destructive DDL.

3. **Repositories.** Mechanical, following #119/#120:
   - `emailTemplates.ts` — every function gains `eq(emailTemplates.orgId,
     orgId)` in its `where`; the `orderBy(orgId)` hack in
     `findEmailTemplateByKey` (added when `key` stopped being globally unique)
     goes away entirely, since `(org_id, key)` now resolves to one row.
     Creates set `orgId`.
   - `emailLog.ts` — `createEmailLogEntry(orgId, input)` sets it;
     `listEmailLogEntries(orgId, limit)` filters.
   - `reminderRules.ts` — filter reads; also scope the `leftJoin` to
     `email_templates` by org in `listReminderRules` so a rule can never
     surface another org's template name. `createReminderRule` sets `orgId`.
   - `scheduledEmails.ts` — add `eq(scheduledEmails.orgId, orgId)` to
     `listScheduledEmails`, `findScheduledEmailById` and the
     `cancelScheduledEmail` `UPDATE` (keeping the `status = 'pending'` guard
     in the same `where`, so a cross-org cancel loses the same way a
     non-pending one does).

4. **Routes.** `req.orgId!` first argument everywhere. Two places need more
   than a parameter:
   - `routes/reminderRules.ts` POST/PATCH already look the template up with
     `findCorrespondenceTemplateById`; once that is org-scoped, a rule
     pointing at another org's template 404s with the existing branch — no new
     error type needed. Update the `isPgUniqueViolation` constraint name if
     the unique is renamed.
   - `routes/mail.ts`'s `send-correspondence` looks the template up the same
     way; same result.

5. **Send layer.** `sendWelcomeEmail(orgId, …)` resolves the welcome template
   with `findEmailTemplateByKey(orgId, WELCOME_TEMPLATE_KEY)` — so an org
   without one throws the existing broken-install error rather than silently
   borrowing another org's. `sendCorrespondenceEmail` passes `orgId` into
   every `createEmailLogEntry` in its `logAll` helper, so a failed send logs
   into the right org too.

6. **Automation user.** Swap `db` for `adminDb` in `automationUser.ts` and
   drop the automation membership from `bootstrap.ts`. The row is global and
   membership-less by design; nothing authorizes against it (`isActive: false`
   already blocks sign-in), it is only an author/sender id.

7. **Planner.** Extend the `INSERT … SELECT` to carry the org and to join
   within one org:

   ```sql
   insert into scheduled_emails (org_id, rule_id, policy_id, occurrence_date, scheduled_for)
   select r.org_id, r.id, p.id, p.expiration_date, …
   from reminder_rules r
   join auto_policies p on p.org_id = r.org_id and p.status = 'active'
   where r.enabled and r.trigger = 'policy_expiration' and …
   ```

   `p.org_id = r.org_id` is the whole cross-tenant fix: without it a rule in
   org A queues reminders against org B's policies. Keep the `for share of r`,
   the `on conflict do nothing`, and the timezone expression exactly as they
   are — `REMINDER_TIMEZONE`/`REMINDER_SEND_HOUR` stay process-wide this
   issue. Add an optional `orgId` parameter that appends `and r.org_id =
   ${orgId}` for the manual tick. Switch the executor default from `db` to
   `adminDb`.

8. **Dispatcher.** `claimBatch(batchSize, orgId?)` adds `and org_id =
   ${orgId}` to the inner select when given one. `resolveOrgId` loses its
   null-fallback branch and becomes a plain read of `row.org_id` (now
   non-null) — keep `UnsendableError` for the case where the row's policy is
   gone. `releaseStaleClaims` takes the same optional org filter so a manual
   tick does not reap another org's stuck rows. For `{{agentName}}`, load the
   organization (`findOrganizationById(orgId)`) and pass it to
   `agencyIdentity`. Switch its direct queries to `adminDb`; note that the
   repository calls it makes (`getPolicyWithDetails`, `getClientWithDetails`,
   `listEmailsByClientId`, `createPolicyLog`, `findCorrespondenceTemplateById`)
   still go through `db` — that is fine and stays that way, because they are
   already explicitly org-scoped.

9. **`agencyIdentity`.** Keep it in `jobs/config.ts` but make it pure and
   organization-taking rather than DB-reading, so `config.ts` stays an
   env-only module:

   ```ts
   export function agencyIdentity(org: { name: string }): CorrespondenceAgent {
     return { name: org.name, email: process.env.MAIL_REPLY_TO ?? "" }
   }
   ```

   The dispatcher is the only caller and already has the `orgId` in hand.

10. **Manual tick.** `runReminderTickNow(orgId)` calls
    `planDueReminders(adminDb, orgId)` then `dispatchReminders(orgId)`. The
    timer path `runReminderTick()` stays global (no org) — that is the whole
    point of a background scheduler. `routes/reminderRules.ts` passes
    `req.orgId!`.

11. **Docs and `.env.example`** last, once the code settles.

## Tests

Backend, vitest + `TestContext`. Never `db:seed`; run against your own scratch
database (`docker compose exec -T db createdb -U postgres myapp_<agent>`,
inline `DATABASE_ADMIN_URL`/`DATABASE_URL`, `db:push`, `db:bootstrap`) —
the `SET NOT NULL` DDL is destructive and will fail outright on the shared
database if anything there still holds a `NULL`.

- **Fixtures.** `ctx.template()` and `ctx.reminderRule()` gain an optional
  `orgId` defaulting to the context org, like `ctx.cookie()` and `ctx.log()`.
  Once `reminder_rules` is unique per org, the random-`offsetDays` trick in
  `ctx.reminderRule()` is no longer needed for collision avoidance — keep it
  anyway (it is also what keeps a parallel worker's planner run from matching
  this test's policies) and update the comment to say so.
- **Cleanup ordering.** `email_log` rows now carry `org_id`, an FK to
  `organizations`, and the existing sweep only deletes them by
  `triggeredBy in userIds`. A send triggered by the *automation* user (the
  scheduler tests) is not covered by that, so add an
  `email_log.orgId in orgIds` sweep before the `organizations` delete, next to
  the existing `email_templates` one. Same check for `scheduled_emails` —
  today it cascades from `reminder_rules`/`auto_policies`, which are deleted
  first, so it should be covered; verify rather than assume (a leftover
  surfaces as an FK error on the org delete).
- **Wrong-org cases**, mirroring `routes/vehicles.test.ts`: a second
  `ctx.org()`, a row built in it, then assert the caller's list omits it and
  every by-id route 404s.
  - `emailTemplates.test.ts` — GET/PUT `/email-templates/welcome` against an
    org whose welcome row belongs to someone else; assert the PUT creates a
    row in the caller's org rather than editing the other one.
  - `correspondenceTemplates.test.ts` — list omits, PATCH/DELETE 404.
  - new `reminderRules.test.ts` — list omits; PATCH/DELETE of another org's
    rule 404s; POST naming another org's `templateId` 404s; `GET
    /scheduled-emails` omits another org's queue; `POST
    /scheduled-emails/:id/cancel` on another org's row 404s (not 409).
  - `mail.test.ts` — `send-correspondence` with another org's `templateId`
    404s; the `email_log` rows a successful send writes carry the caller's
    org.
  - `emails.test.ts` — `sendWelcomeEmail` uses the passed org's template and
    logs into that org.
- **Per-org uniqueness.** Two orgs each create a reminder rule at the same
  `(trigger, offsetDays)`; both succeed. A duplicate within one org still
  409s. Same shape for a `welcome` template key in two orgs.
- **Two-org scheduler test** (in `jobs/reminders.test.ts`, which is
  deliberately one file — read its header comment before adding):
  build org A and org B, each with an enabled rule at the same offset, a
  template, and an active policy with a client email lined up to that offset.
  Run `planDueReminders()`, then for each org assert its `scheduled_emails`
  rows reference only its own `policy_id` and `rule_id` — i.e. exactly
  2 rows total across the two orgs, not 4. Filter every assertion to the
  fixtures' own ids; never count globally (parallel workers share the table).
  Then dispatch and assert each org's `email_log` row carries its own
  `org_id`, and that `{{agentName}}` rendered each organization's `name`.
- **Manual tick is org-scoped.** Admin in org A hits `POST /reminders/tick`;
  assert org B's due rule produced nothing and org B's pending row was not
  claimed.
- **`AGENCY_NAME` is gone.** Drop the `process.env.AGENCY_NAME = "Test Agency"`
  line from `reminders.test.ts`'s `beforeEach` and assert on the org's name
  instead. A `grep -r AGENCY_NAME` over the repo (excluding `pipeline/`) must
  come back empty.
- **`NOT NULL` bites.** One repository-level test that a raw insert without
  `org_id` into a tenant table is rejected by the database, so the constraint
  can't be silently lost by a future push.
- Re-run the full backend suite plus `tsc --noEmit` and `npm run lint` /
  `format:check`. No frontend change is expected; nothing under `frontend/`
  should need touching.

## Touches backend

yes

## Risks / open questions

- **The "every repository takes `orgId`" acceptance grep has exceptions.**
  `users.ts` (users are global, keyed by email at login), `sessions.ts`
  (sessions carry an org, they aren't scoped by one), `organizations.ts`,
  `orgMemberships.ts` and `errors.ts` are all deliberately global. The plan is
  to scope every *tenant-table* repository and document those five as named
  exceptions in `repositories/index.ts`'s header comment, so the grep is
  checkable against an explicit list rather than being literally empty. Flag
  if the reviewer wants something stricter.
- **Switching the jobs to `adminDb`.** The issue asks for it, and it makes
  sense ahead of sub-issue 8's RLS (the scheduler has no request and therefore
  no `SET LOCAL app.org_id`). But it also means the background jobs stop
  running under the non-superuser role that `db/index.ts`'s comment describes
  as the "missed authorization check" backstop, at exactly the moment the
  planner's SQL becomes responsible for its own org join. Mitigation is the
  two-org planner test above. Worth a sentence in `docs/multitenancy.md` and
  in `db/index.ts`'s comment, which currently says the scheduler runs as `app`.
- **What is actually in the production database.** #117 added `org_id NOT NULL
  DEFAULT 1` when ids were integers; #130 turned ids into 22-char strings and
  dropped the default. Whether production rows now hold `NULL`, a stale `'1'`,
  or a real org id needs checking before the backfill runs — a stale `'1'`
  would be a dangling FK value, not a `NULL`, and the backfill as written
  would skip it while the `SET NOT NULL` succeeded. Add a pre-flight query
  (`select org_id, count(*) … group by 1`) over each tenant table to the
  implementation notes and adjust the script to what it finds.
- **Deploy ordering.** The backfill has to run before `drizzle-kit push` in
  the container `CMD`, but the default organization it needs is normally
  created by `bootstrap.ts`, which runs after. The plan has the script create
  it itself (insert-if-absent on the same slug), which means the same row is
  ensured twice per boot — harmless, but it does duplicate a piece of
  bootstrap. The alternative (move the org creation out of bootstrap into a
  shared helper both call) is cleaner and cheap; take it if it reads well.
- **`findEmailTemplateByKey` becomes org-required, and the invite path is its
  only caller.** An organization created without a welcome template (nothing
  today creates an org outside bootstrap/seed, but sub-issue 7's onboarding
  flow will) makes invites throw a 500. Out of scope to fix here — the
  onboarding issue owns it — but name it in the notes so it isn't a surprise.
- **Legacy `org_id NULL` rows become invisible, then get a home.** Unlike #119
  and #120, where they stayed invisible, this issue actively assigns them to
  the default org. That is the intended end state, but it is the first change
  in the series that *moves* existing production data rather than just hiding
  it. Worth calling out in the PR description.
- **`PROJECT.md` is stale** about multi-tenancy ("there is no `organizations`
  table"). Not this issue's scope; note it for a later docs pass.

## Out of scope

- Row-level security and `SET LOCAL app.org_id` (sub-issue 8 / #122).
- Frontend (sub-issue 9) — no endpoint shape changes here, so nothing should
  break.
- Per-organization `MAIL_REPLY_TO`, `REMINDER_TIMEZONE`, `REMINDER_SEND_HOUR`
  and the planning window: they stay process-wide, and the planner keeps one
  global timezone/send hour. `docs/multitenancy.md`'s "the reminder planner
  iterates organizations and honors each one's timezone" is that later issue,
  not this one.
- Organization creation / invite flow and retiring `ADMIN_EMAIL` (step 7).
- The demo org (step 8).
- Migrating attachment storage keys — #120 did the new `org/<org_id>/…`
  prefix and deliberately left older objects on their old keys.
- Rewriting `PROJECT.md`'s stale multi-tenancy paragraph.
