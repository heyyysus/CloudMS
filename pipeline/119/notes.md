---
issue: 119
---

# Implementation notes — issue #119

## Implemented

- Schema: `carriers.naic` and `auto_policies.policy_number` uniques dropped and replaced with
  composite `unique(org_id, naic)` / `unique(org_id, policy_number)` constraints
  (`backend/src/db/schema.ts`). Applied to this runner's database with `npm run db:push`.
- `repositories/errors.ts`: `CrossOrgReferenceError`, re-exported from `repositories/index.ts`.
- All ten repository modules in scope (`persons`, `drivers`, `clients`, `clientPhones`,
  `clientEmails`, `carriers`, `autoPolicies`, `policyDrivers`, `vehicles`, `search`) take `orgId`
  as their first parameter, `and()` it onto every `select`/`update`/`delete`, and set it from the
  parameter (never the body) on every insert, via `Omit<New*, "orgId">`.
- Every write that sets a parent FK (`vehicles.policyId`, `autoPolicies.clientId`/`carrierId`,
  `clients.namedInsuredId`/`secondNamedInsuredId`, `drivers.personId`,
  `policyDrivers`/`linkPolicyDrivers`'s person/driver lookups, `clientPhones`/`clientEmails`'
  client lookups) checks the parent's org inside the same transaction, on create **and** update,
  and throws `CrossOrgReferenceError` when it belongs to another org.
- `getClientWithDetails` / `getPolicyWithDetails` filter the root row and every nested to-*many*
  relation by `orgId`; to-*one* relations are left unfiltered per the plan (justified by drizzle's
  API and by the parent checks above covering both insert and update).
- `searchClients` / `searchPolicies` scope every join and the hydration `findMany` by `orgId`.
- Routes (`persons`, `clients`, `carriers`, `policies`, `vehicles`, `search`) thread `req.orgId!`
  into every repository call. `app.ts`'s error handler and `routes/policies.ts`'s
  `handlePolicyWriteError` both map `CrossOrgReferenceError` to the same status/message a plain FK
  violation already produced (409 "Referenced by or references other records" / 400 "Invalid
  client or carrier"), so cross-org and nonexistent parents are indistinguishable.
  `routes/carriers.ts` / `routes/policies.ts` constraint-name strings updated to the composite
  names. `routes/schemas.ts`'s `omitMeta` gained `orgId: true` so a request body can no longer
  smuggle a different org.
- Out-of-scope callers updated to compile against the new signatures without changing their own
  scoping: `policyLogs.ts`, `policyAttachments.ts`, `accountingDocuments.ts`, `mail.ts`,
  `jobs/dispatcher.ts` (org comes from the claimed row; `ClaimedRow`/`claimBatch` now carry
  `org_id`), `db/seed/policies.ts` (`reassignPoliciesToOrg` and its call sites deleted —
  `seedPolicies` takes the org directly now).
- `TestContext` (`routes/testHelpers.ts`): every fixture builder resolves
  `overrides.orgId ?? (await this.defaultOrg())`; added a public `orgId()` accessor; `cleanup()`
  sweeps `drivers`/`persons` by org too, for driver rows a nested "new" driver spec creates
  server-side and that never reach `personIds`.
- Repository test files that bypass `TestContext` (`persons.test.ts`, `autoPolicies.test.ts`,
  `policyDrivers.test.ts`) mint their own org in `beforeAll`/cleanup it in `afterAll`; includes a
  repository-level cross-org create rejection test in `autoPolicies.test.ts`.
- Route test files (`persons`, `clients`, `carriers`, `policies`, `vehicles`, `search`) each gained
  a wrong-org invisibility case (absent from list, 404 on get/patch/delete). `vehicles`, `policies`
  (`clientId` and `carrierId`), and `clients` (`namedInsuredId`) additionally gained a cross-org
  `PATCH`-rejection case that asserts the row is unchanged afterwards, not just the status code.
  `carriers` and `policies` gained a same-value-different-org uniqueness case for NAIC and policy
  number respectively.
- `docs/API.md`'s Tenancy bullet and `docs/multitenancy.md`'s *Request scoping* bullet and rollout
  step 4 status line updated to record that people/clients/carriers/policies/vehicles/search are
  now org-scoped, and that logs/attachments/accounting (#120) and email/reminders/scheduler/
  storage keys/`org_id NOT NULL` (#121) remain.
- Removed a stray `.claude/scratch/debug_check.ts` left over from the earlier (turn-capped) run of
  this pipeline — a one-off debug script, not part of the plan.

## Decisions

- `db/bootstrap.ts` needed no change: it only inserts `organizations`, `users`, `orgMemberships`,
  and `emailTemplates` rows, none of which are among the ten modules this issue scopes.
- Confirmed no `routes/drivers.ts` exists (drivers are only reached through the policies routes'
  driver-linking, which is already covered), matching the issue's route list.

## Deviations from plan

None. Implemented exactly the modules, routes, and tests the plan scoped; no scope expansion.

## For the docs stage / reviewer

- The plan's two open questions were resolved as it predicted: `GET /policies?clientId=<other
  org>` and `GET /vehicles?policyId=<other org>` return `200 []` for free, since the list-filter
  repository functions already `and()` the org condition; a cross-org parent gets the identical
  message a nonexistent parent gets (no distinguishable error).
- The to-one-relations-unfiltered tradeoff (step 4 of the plan) is live in `getClientWithDetails`
  and `getPolicyWithDetails` and is load-bearing on the parent-FK checks covering both insert and
  update paths — flagged here per the plan's request, worth a second look in review.
- Composite unique constraints are already applied on this runner's database (`db:push` was run
  earlier in this pipeline); `npx tsx src/db/bootstrap.ts` was re-run at the end of this session
  and is idempotent as expected.

## Checks run

- `cd backend && npm run typecheck` — pass
- `cd backend && npm run lint` — pass (0 errors, 0 warnings)
- `cd backend && npm run format:check` — pass (ran `npm run format` once to fix two files)
- `cd backend && npm test` — 439/439 passing (34 files)
- `cd backend && npm run build` — pass
- `cd frontend && npm run lint` — pass (pre-existing `only-export-components` warnings only, no
  errors; unrelated to this issue, no frontend files touched)
- `cd frontend && npm run build` — pass
