# Plan review — issue #119

## Findings

- Scope matches the issue precisely: the ten repository modules and six route files listed in
  "Files / areas" are exactly the set named in the issue, `routes/vinDecoder.ts` is correctly
  left untouched, and the "Out of scope" section mirrors the issue's own (sub-issues 6/7/8/9).
  Nothing extra is pulled in.
- The plan correctly registers and acts on the re-plan directive: it is written against opaque
  string ids (`Omit<New*, "orgId">`, `db.transaction` parent checks) rather than integers, and
  explicitly calls out that `agent/issue-119`'s current tree predates #130 and must be
  rebased/re-cut from `main` before coding — spot-checking the working tree confirms this is true
  today (`schema.ts` still has integer `org_id` columns with "Temporary default 1" comments, and
  `backend/src/db/ids.ts` doesn't exist yet on this branch).
- The carried-over cross-org FK finding (issue rule 2 / test item 5) is addressed thoroughly:
  Approach step 3 requires the parent check on **both** insert and update for every FK pair, wraps
  single-statement updates in a transaction so the check and the `SET` can't straddle a concurrent
  move, and step 7's tests assert the row is unchanged after a rejected cross-org `PATCH`, not just
  the status code — avoiding a status-only assertion that would pass against an unrelated failure.
- Security posture is sound: cross-org rows are uniformly 404 (never 403 or a distinguishable
  message), matching `parseId`'s existing malformed-id behavior and avoiding a cross-tenant
  existence oracle; `Omit<New*, "orgId">` plus `omitMeta` gaining `orgId: true` closes the
  body-supplied-org hole that `routes/schemas.ts` has today (confirmed: `omitMeta` is currently
  exactly `{ id, createdAt, updatedAt }`).
- The one deliberately unresolved gap — unfiltered to-one relations in `getClientWithDetails`/
  `getPolicyWithDetails` — is justified (drizzle's `with:` doesn't take a `where` on a to-one, and
  a filtered-out to-one would violate the non-null response shape) and is explicitly flagged as
  load-bearing on step 3's parent checks, with RLS (sub-issue 8, already out of scope) named as the
  backstop. This is a reasonable, well-disclosed tradeoff rather than an oversight.
- Direction matches PROJECT.md Direction item 2 ("organization-scoped repositories") and
  `docs/multitenancy.md` rollout step 3 ("Repository/route half remains — sub-issues 4-6"),
  confirmed present verbatim in the doc today.
- Soundness spot-checks all passed: constraint-name strings (`carriers_naic_unique`,
  `auto_policies_policy_number_unique`), `PolicyWriteError` / the exact `Person ${id} not found`
  message, `app.ts`'s `23503` → `409 "Referenced by or references other records"` branch, the
  `repositories/index.ts` header comment the plan quotes to rewrite, and the out-of-scope caller
  sites (`policyLogs.ts:26`, `db/seed/run.ts:54` for `reassignPoliciesToOrg`) all match the current
  tree exactly. `TestContext` (`testHelpers.ts`) already has `org()`, `user(prefix, role, orgId?)`
  and `cookie(userId, orgId?)` as sub-issue 3 claims, so step 6's plan to extend the fixture
  builders is a natural continuation of an existing pattern, not a new one.
- Tests are adequate and follow existing conventions: wrong-org invisibility case per route file,
  cross-org `PATCH`-rejection cases with unchanged-row assertions, repository-level cross-org
  create rejection for `autoPolicies`, and same-value-different-org uniqueness cases for the two
  constraints being made composite. The three repository test files that bypass `TestContext`
  are called out by name with a concrete fix.
- No CLAUDE.md convention (outside the concurrent-agents section, which this review is told to
  ignore) is violated by the plan.

## Required changes (if rejected)

N/A

Verdict: approved
