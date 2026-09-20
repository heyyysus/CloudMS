# Implementation notes — issue #117

## Implemented

- `organizations` table (`id`, `name`, `slug` unique, `next_invoice_number`,
  `next_receipt_number`, timestamps), declared before `users` in `schema.ts`.
- `org_memberships` table (`user_id` → `users` cascade, `org_id` →
  `organizations` cascade, `role` mirroring `users.role`, `is_active`,
  unique on `(user_id, org_id)`, index on `org_id`).
- `sessions.org_id`, nullable, unread until sub-issue 3.
- `org_id NOT NULL DEFAULT 1` + FK + index on all 21 tenant tables from the
  issue's list (persons, drivers, clients, client_phones, client_emails,
  carriers, auto_policies, vehicles, policy_drivers, policy_logs,
  policy_attachments, policy_log_attachments, invoices, invoice_items,
  payments, receipts, trust_ledger, email_templates, email_log,
  reminder_rules, scheduled_emails). `auto_policies` gets the composite
  `(org_id, client_id)` index per the plan; everything else gets a plain
  `org_id` index alongside its existing indexes.
- `email_templates.key` unique → `(org_id, key)`.
- `invoices.invoice_number` / `receipts.receipt_number`: NOT NULL identity
  columns (`generatedByDefaultAsIdentity()`), unique per `(org_id, *_number)`.
  Confirmed drizzle-kit 0.31 pushes these cleanly (verified by running the
  push, not by inspection).
- `relations.ts`: `organizationsRelations`, `orgMembershipsRelations`,
  `memberships` on `usersRelations`, `org` on `sessionsRelations`.
- `types/index.ts`: `Organization`, `NewOrganization`, `OrgMembership`,
  `NewOrgMembership`.
- `repositories/organizations.ts` (`findOrganizationById`,
  `findOrganizationBySlug`) and `repositories/orgMemberships.ts`
  (`listMembershipsForUser`, `findMembership`, `createMembership`,
  `updateMembership`), both exported from `repositories/index.ts`; header
  comment refreshed to point at the rollout instead of claiming no table has
  a tenant column.
- `emailTemplates.ts`: `upsertEmailTemplate`'s conflict target and
  `bootstrap.ts`'s conflict target both became `[orgId, key]`;
  `findEmailTemplateByKey` added `.orderBy(orgId).limit(1)` to stay
  deterministic once more than one org has a "welcome" row.
- `bootstrap.ts`: inserts organization 1 first (insert-if-absent, then
  `setval`s the serial), then users, then an admin membership for
  `ADMIN_EMAIL` and a staff membership for the automation user, then the
  welcome template scoped to org 1.
- Seed (`db/seed/*`): new `organizations.ts` seeds org 1 ("default org") and
  org 2 ("second org") with explicit ids + `setval`. `users.ts`, `carriers.ts`,
  `households.ts` take an explicit `orgId` (and, for users/carriers, a shared
  `usedEmails`/`usedNaics` set so the two orgs' random data can't collide on
  the still-global `users.email` / `carriers.naic` uniques). `policies.ts`
  takes a `policyNumberPrefix` so org 2's policies don't collide with org 1's
  `POL-*` numbers (`POL2-*`). `run.ts` orchestrates: org 1 gets the full
  100-client/300-policy/financials seed; org 2 gets 2 staff, 2 carriers, 5
  clients (only 2 of which get a policy - see Deviations), and a welcome
  template, with no financials. Policies for org 2 are created through the
  same `createAutoPolicyWithDetails` repository call as org 1 (landing in
  org 1 via the column default) and then moved with a small
  `reassignPoliciesToOrg` fix-up over `auto_policies`, `vehicles`,
  `policy_drivers`, `policy_logs`. `wipe.ts` now also deletes
  `org_memberships`, `email_templates` (all rows - reseeded per org),
  `reminder_rules`/`scheduled_emails` (defensively, so a non-cascading FK to
  `email_templates` can't block the wipe), and `organizations` last.
- `docs/multitenancy.md`: Data model section rewritten to describe
  `org_memberships` instead of `org_id` on `users` (resolving the doc's old
  "Open" question the way the issue directs), and to describe the
  `db:push` + temporary-default + bootstrap approach instead of a backfill
  migration, including a callout that a real deploy needs organization 1
  inserted between two pushes. Rollout order steps 1-2 updated to match.

## Decisions

- `seedCarriers`/`seedUsers` take an explicit shared "used" set (naics /
  emails) across both org calls, mirroring the pattern the plan called out
  for carriers. Not literally required by the plan's pseudocode signatures,
  but the alternative (relying on faker's fixed seed never colliding) felt
  fragile for a script meant to be reproducible.
- `reassignPoliciesToOrg` and `seedWelcomeTemplate` live in `run.ts` rather
  than new files, since the plan's "Files / areas" list didn't add new seed
  files beyond `organizations.ts`.

## Deviations

- The issue/plan says org 2 gets "5 clients, a couple of policies". The
  existing `pickPolicyCounts` (in `seed/policies.ts`, unchanged) guarantees
  every household passed to `seedPolicies` gets at least one policy, so
  5 households with only 2 total policies is infeasible through that
  function (division would infinite-loop - hit this while testing: `npm run
  db:seed` spun forever with pg connections idle, no query being sent).
  Fixed by seeding 5 org-2 households but only passing the first 2 into
  `seedPolicies`; the other 3 are clients with no policy yet, which is a
  realistic state (a prospect) and keeps `seedPolicies` itself untouched.

## For the docs stage / reviewer

- Plan's Risks section flags that `db:push` against a database that already
  has rows (production, or a previously-bootstrapped shared dev DB) fails
  until organization 1 exists, because `bootstrap.ts` (which creates it)
  runs after push. This is unresolved by design - the plan says to surface
  it in the PR body for a maintainer decision rather than invent a
  deploy-workflow change inside a schema sub-issue. Flagging here so it
  isn't lost: a real rollout needs organization 1 inserted between two
  pushes, or a pre-push step.
- No `.github/workflows` changes were needed for this issue.

## Checks run

All run on this runner's own Postgres (`DATABASE_URL`/`DATABASE_ADMIN_URL`
already pointed at it - no shared DB touched):

- `npm run db:push` against a freshly dropped/recreated schema: succeeds,
  including the two identity columns.
- `npm run db:bootstrap`: creates organization 1, admin + automation users,
  their org-1 memberships, and the welcome template; re-run confirmed
  idempotent.
- `npm run db:seed`: completes and produces the expected row counts
  (2 organizations, 9 org_memberships, 100/5 clients split 1/2, 300/2
  policies split 1/2, `POL2-*` policy numbers for org 2, no financials for
  org 2). Verified directly with psql, not just by reading the script.
- `npx vitest run` after `db:push` + `db:bootstrap` (the CI order - `db:seed`
  is not part of CI and wipes the automation user, which is pre-existing
  behavior unrelated to this change): 399/399 pass (390 existing + 9 new),
  no test-side edits.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run
  build`: all clean.
- No frontend changes, so no frontend lint/build run.

## Docs

No doc changes needed: this sub-issue only adds schema/seed/repository
plumbing (`organizations`/`org_memberships` tables, `org_id` columns,
`repositories/organizations.ts` and `orgMemberships.ts`) with nothing wired
into routes, auth, or the frontend yet, so no route/endpoint/response shape,
auth/session behaviour, UI convention, or setup/env-var/script changed.
`docs/multitenancy.md` was already updated by the implementation stage (part
of the diff, not this stage). Note for a later sub-issue's docs stage:
`docs/API.md`'s "Tenancy" bullet still says "the schema has no organization
yet," which is now literally false (the tables exist, just unused by
routes) — worth a wording pass once routes actually start scoping by org.
