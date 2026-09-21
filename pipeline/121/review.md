# Plan review — issue #121

## Findings

- Scope matches the issue precisely: all 8 numbered items in the issue body map onto the
  plan's "Done means" list and Approach steps, with `RLS`, frontend, and per-org
  reply-to/timezone/send-hour explicitly carried into Out of scope, matching the issue's own
  carve-outs. No scope creep found — the plan even declines to fix `PROJECT.md`'s stale
  multi-tenancy paragraph and `docs/multitenancy.md`'s "storage keys still don't take an
  orgId" bullet inline, correctly deferring the former and correctly catching the latter as a
  doc fix within this issue's own doc-update item (multitenancy.md).
- Direction is correct: this is roadmap item 2 in `PROJECT.md` and rollout step 4's closing
  slice plus step 6's first slice per `docs/multitenancy.md`. It is the direct continuation of
  #119/#120 and reuses their `orgId`-first / filter-in-`where` / set-on-insert /
  `ctx.org()` pattern rather than inventing a new one.
- Soundness spot-checked against the actual code and holds up in every case checked:
  `backend/src/db/schema.ts` line numbers for `emailTemplates.orgId` (128),
  `emailLog.orgId` (153), `reminderRules.orgId` (184), `scheduledEmails.orgId` (225), and the
  `reminder_rules_trigger_offset_unique` constraint (202) are exact. `backend/src/db/index.ts`
  confirms the `db`/`adminDb` role split the plan relies on for jobs. `backend/src/jobs/
  automationUser.ts` and `dispatcher.ts` currently use `db`, not `adminDb`, as the plan says
  needs to change. `backend/src/db/bootstrap.ts` lines 56–64 are exactly the automation-user
  membership insert the plan says to delete. `backend/src/repositories/reminderRules.ts`'s
  `listReminderRules` join to `emailTemplates` (line 24) is currently unscoped, matching the
  plan's step to add an org filter there. `backend/src/routes/testHelpers.ts` cleanup (line
  364) sweeps `email_log` only by `triggeredBy in userIds`, confirming the plan's claim that
  automation-user-authored rows (the scheduler test) would leak past `cleanup()` without the
  new `email_log.orgId in orgIds` sweep it adds.
- Tests are adequate and correctly specified: wrong-org cases for templates, correspondence
  templates, reminder rules, scheduled-email cancel, and mail send; a genuine two-org
  scheduler test asserting the planner's join doesn't cross tenants; a manual-tick org
  isolation test; an `AGENCY_NAME`-is-gone grep; and a repository-level test that a raw
  `org_id`-less insert is rejected by the database once `NOT NULL` is restored. All specified
  to use `ctx.org()`/`TestContext` fixtures and scoped assertions ("never count globally"),
  consistent with the concurrency rules in the (ignored) CLAUDE.md section and with how
  #119/#120 already test this.
- Security is the core of this issue and is handled correctly: every repository gets `orgId`
  as a first, filtering parameter; cross-org rows 404 rather than leak; the planner's
  same-org join (`p.org_id = r.org_id`) is the actual fix for the cross-tenant reminder bug
  the issue is about; the automation user stays membership-less and `isActive: false` so it
  can't authenticate; `agencyIdentity` becomes pure and organization-taking so a client only
  ever sees their own agency's name. The plan is honest about the one architectural tension
  worth watching — moving jobs to `adminDb` forfeits the non-superuser backstop described in
  `db/index.ts` ahead of RLS — but that move is mandated by the issue text itself (jobs "run
  through `adminDb`"), not a choice the plan introduced, and it's mitigated by the two-org
  planner/dispatcher tests.
- Reasonable judgement call, flagged for the reviewer rather than hidden: the acceptance
  criterion "every repository module takes `orgId` as first parameter" can't literally hold
  for `users.ts`, `sessions.ts`, `organizations.ts`, `orgMemberships.ts`, `errors.ts` (global
  by design, confirmed against `sessions.orgId`'s deliberately-nullable, non-tenant column at
  schema.ts:109). The plan documents these as named exceptions in `repositories/index.ts`
  rather than silently redefining the grep. This is the right call, not a scope violation.
- Conventions: no CLAUDE.md violations found outside the concurrent-agents section (excluded
  per instructions). Backfill-before-schema ordering, running `db:push` only against a scratch
  database, and never using `db:seed` are all called out correctly in Approach/Tests.

## Required changes (if rejected)

N/A

Verdict: approved
