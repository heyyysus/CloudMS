# Plan review — issue #117

## Findings

- **Scope matches the issue closely.** All ten numbered items in the issue (organizations,
  org_memberships, sessions.org_id, org_id-on-21-tables with the temporary default of 1,
  per-org uniques, invoice/receipt numbers, bootstrap, seed, types/relations, two repository
  modules + tests) are addressed, and the plan's "Out of scope" section correctly excludes
  auth/session binding, repository scoping, RLS, and frontend, matching the issue's own "Out of
  scope" list. No scope creep found.

- **Direction: consistent with PROJECT.md and docs/multitenancy.md**, and the plan handles the
  one real tension well. `docs/multitenancy.md` (lines 48-50) has `org_id` on `users` with
  single-org membership as the shipped design and multi-org as an **Open** question; issue #117
  instead mandates a real `org_memberships` table. The plan (plan.md "Scope check") explicitly
  calls this out as a deliberate divergence, resolves the doc's Open question the way the issue
  directs, and schedules an update to the doc's Data model section — the right way to keep a
  living design doc from going stale. Rollout-order steps 1-2 are otherwise followed faithfully.

- **Soundness — spot-checked against the real files, all claims held up:**
  `repositories/users.ts` matches the described mirror pattern (plain `db`, `returning()`,
  `updatedAt: new Date()` on update) the plan says the two new repos will follow.
  `repositories/emailTemplates.ts` confirms both `onConflictDoUpdate({ target: emailTemplates.key
  })` and `findEmailTemplateByKey`'s single-row select that the plan says must change.
  `bootstrap.ts` confirms the `onConflictDoNothing({ target: emailTemplates.key })` and the
  order of admin-user-then-template inserts the plan builds on. `db/seed/users.ts` and
  `wipe.ts` confirm seed inserts go through plain `db.insert(...)` (so threading `orgId` is
  mechanical, as claimed) and that `wipe.ts` currently skips `email_templates` "so admin edits
  survive" — the plan correctly identifies that this becomes a dangling FK problem once
  `email_templates.org_id` exists and proposes handling it. `db/seed/policies.ts` and
  `financials.ts` confirm `seedPolicies`/`seedFinancials` go through repositories
  (`createAutoPolicyWithDetails`, `createInvoiceWithDetails`, `recordPayment`,
  `createPolicyLog`) rather than direct inserts, supporting the plan's "second org" fix-up
  approach. `package.json` confirms `drizzle-kit@0.31.10`, matching the plan's caveat about
  `generatedByDefaultAsIdentity()` support needing to be confirmed by running the push rather
  than assumed. `unique(...)` naming conventions elsewhere in `schema.ts` (e.g.
  `vehicles_policy_id_vin_unique`, `reminder_rules_trigger_offset_unique`) match the names the
  plan proposes for the new constraints. The `repositories/index.ts` header comment the plan
  says is stale ("none of the tables have an owner/tenant column today") is verified present.

- **Deployment risk correctly identified rather than glossed over.** The plan's "Risks" section
  flags that adding `org_id NOT NULL DEFAULT 1` with an FK via `db:push` will fail against the
  shared dev DB and production, because the FK-validation step needs organization 1 to already
  exist, while `bootstrap.ts` (which creates it) runs *after* push in the Dockerfile CMD and in
  `ci.yml`. Rather than silently working around this inside a schema-only sub-issue, the plan
  recommends surfacing it to a maintainer in the PR body — appropriate given the issue's own
  scope line ("no cross-tenant enforcement yet") and acceptance criterion (fresh-DB push only).

- **Tests**: two new repository test files following the existing non-TestContext convention
  used by comparable repo tests (`repositories/sessions.test.ts`: unique prefix, `afterEach`
  cleanup by prefix, no truncation, no global counts) — verified against that file. `TestContext`
  in `routes/testHelpers.ts` is for route/integration tests, not plain repository unit tests, so
  its absence here is consistent with existing conventions rather than a gap. Regression coverage
  (full existing suite unchanged) is the right acceptance bar for the temporary-default approach.

- **Security**: no auth/session-handling change, no new endpoints, no secrets touched. The
  `sessions.org_id` column is added but explicitly left unread until sub-issue 3. Object storage
  and cross-tenant query concerns are out of scope for this sub-issue and correctly deferred.

- **Minor, non-blocking**: the plan itself flags `reminder_rules(trigger, offset_days)` staying
  globally unique as a possible scope question (two orgs configuring the same reminder would
  collide) but defers to the issue's literal text, which names only `email_templates.key`. That's
  a defensible reading, not a planning error — worth a maintainer's eyes in review but not grounds
  for rejection.

## Required changes (if rejected)

N/A

Verdict: approved
