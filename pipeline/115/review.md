# Plan review — issue #115

## Findings

- **Scope matches the issue precisely.** Every decision in the issue body (org
  model, membership table replacing `users.role`, session-bound active org,
  two-layer isolation, per-org numbering, no-migrations schema management,
  seed shape, cross-tenant tests) is accounted for in the plan's Goal section,
  and the *Out of scope* list is copied through unchanged (org creation, moving
  `MAIL_REPLY_TO`/`REMINDER_TIMEZONE`/`REMINDER_SEND_HOUR`, `/o/:slug` URLs,
  demo org). No scope creep found — e.g. it correctly declines to rename
  `POST /users/invite` to match the issue's loose `POST /users` phrasing,
  calling that gratuitous churn (plan's "Users routes" section).
- **Verified against actual repo state, not just the issue text.** Spot-checked
  `backend/src/db/schema.ts`, `backend/src/auth/middleware.ts`,
  `backend/src/auth/routes.ts`, `backend/src/db/migrate.ts`,
  `backend/src/routes/testHelpers.ts`, `backend/package.json`,
  `backend/drizzle.config.ts`, `backend/Dockerfile`, and `.github/workflows/ci.yml`.
  Every factual claim the plan makes about current code checked out exactly:
  the `repositories/index.ts` "no owner/tenant column today" comment it quotes
  verbatim, the Dockerfile's `COPY drizzle ./drizzle` + `dist/db/migrate.js`
  CMD, CI's `npx ts-node src/db/migrate.ts` step, the existing global uniques
  (`carriers.naic`, `auto_policies.policyNumber`, `reminder_rules(trigger,
  offsetDays)`, `email_templates.key`), and `users.role`/session shape.
- **Deliberate, disclosed deviations are reasonable and flagged, not hidden.**
  Two places where the plan departs from the issue's literal wording are
  explained with tradeoffs and surfaced as open questions rather than silently
  decided: (1) a pinned-connection-per-request instead of the issue's literal
  "transaction that starts with `SET LOCAL`", to avoid holding a transaction
  open across PDF/R2 calls — same RLS guarantee, correctly identified as the
  highest-risk piece and called out for its own test; (2) making
  `carriers.naic` and `auto_policies.policyNumber` per-org uniques, which the
  issue doesn't explicitly list but which correctly avoids a cross-org
  existence-leak via a unique-constraint violation.
- **Security is well-covered.** Two independent isolation layers (compile-time
  `orgId` parameter + RLS backstop with `FORCE ROW LEVEL SECURITY` and a
  `nullif(...) ::int` guard so an unset GUC returns zero rows instead of
  raising), a startup assertion idea against an accidentally-superuser
  `DATABASE_URL` (superusers bypass RLS silently), object-storage keys and
  presign checks pinned to `org_id`, cross-org child-insert checks
  (`createVehicle`, `addDriverToPolicy`), session teardown on membership
  deactivation, and a dedicated cross-tenant test suite asserting 404 (not
  403) on other-org rows so existence isn't leaked. This is thorough for a
  plan-stage document.
- **Tests correctly build on `TestContext`.** Extends it with an `org()`
  builder and org-cascading cleanup rather than inventing a parallel fixture
  system, correctly notes `users.email`'s uniqueness still needs the existing
  random-suffix helpers, and adds `runInOrg` to thread the ALS context through
  fixture writes now that the suite runs as the non-superuser `app` role —
  necessary since RLS would otherwise block the builders' own inserts.
- **Direction alignment.** This is exactly Direction item 2 in `PROJECT.md`,
  and the plan's Scope-check section correctly identifies where the issue
  supersedes the existing `docs/multitenancy.md` design (membership table vs.
  one-user-one-org, RLS now vs. later, no migrations) and commits to rewriting
  that doc rather than leaving it stale.
- Minor, non-blocking: the plan's own "Risks" section already flags the
  hardest open items (pool sizing under a pinned connection per request,
  whether `drizzle-kit push` runs non-interactively in the pinned version,
  where `push` runs given `npm ci --omit=dev`) — these are appropriately left
  as implementation-time decisions rather than blocking the plan.

## Required changes (if rejected)

N/A

Verdict: approved
