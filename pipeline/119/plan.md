---
issue: 119
status: pending-review
---

# Multi-tenant 4/8: org-scope repositories and routes, part 1 (people, clients, carriers, policies, vehicles, search)

## Goal

Isolation layer 1 for the first half of the domain. When this is done:

- Every exported function in `repositories/{persons,drivers,clients,clientPhones,clientEmails,carriers,autoPolicies,policyDrivers,vehicles,search}.ts`
  takes `orgId: number` as its **first** parameter. `tsc` fails if a caller forgets it, and the
  insert input types are `Omit<New*, "orgId">` so a caller cannot pass a *different* org in the
  body of the input either.
- Every `select`/`update`/`delete` in those modules `and()`s an `eq(table.orgId, orgId)` onto its
  where clause; every insert sets `orgId` from the parameter, never from caller data.
- A row in another org behaves exactly like a row that does not exist: invisible to list/search,
  `404` on get/patch/delete. Never `403`, and never a different error message.
- Creating a child verifies its parent(s) belong to the same org **inside the repository**, and a
  parent in another org produces exactly the status a nonexistent parent id produces today
  (`409` from the global handler in `app.ts` for a plain FK; `400 "Invalid client or carrier"` /
  `400 "Person N not found"` on the policy routes, which map FK and `PolicyWriteError` locally).
- `carriers.naic` and `auto_policies.policy_number` are unique per `(org_id, …)` instead of
  globally, so two agencies can write the same carrier or policy number.
- Routes pass `req.orgId` (set by `requireAuth`, already landed in sub-issue 3). Response shapes
  are byte-identical to today, so no frontend change is needed.
- Each of the six route test files gains a wrong-org case; the backend suite is green.

## Scope check

PROJECT.md **Direction item 2** ("organization-scoped repositories"), and the *repository/route
half* of `docs/multitenancy.md` rollout step 3 — which the doc currently records as "Not done yet
(sub-issues 4-6)". This issue does the first half of that half; sub-issue 5 (logs, attachments,
accounting) and 6 (email, reminders, scheduler, storage keys, dropping the `org_id DEFAULT 1`)
finish it.

Verified that the dependency is already merged on this branch: `requireAuth` in
`backend/src/auth/middleware.ts:50` sets `req.orgId`/`req.membership` and 403s `ORG_REQUIRED`
without one, and `TestContext` already has `org()`, `user(prefix, role, orgId?)` and
`cookie(userId, orgId?)` (`backend/src/routes/testHelpers.ts:119-146`).

Triage labels look right: `enhancement`, `agent`, `pipeline:needs-plan`, `area:backend`. No
`area:frontend` — nothing under `frontend/` changes (response shapes are unchanged), and the
frontend work is sub-issue 8.

## Files / areas

**Schema (per-org uniques)**

- `backend/src/db/schema.ts` — `carriers.naic` (line ~428) drops `.unique()`, and the table's
  extras array gains `unique("carriers_org_id_naic_unique").on(table.orgId, table.naic)`.
  `autoPolicies.policyNumber` (line ~457) drops `.unique()` and gains
  `unique("auto_policies_org_id_policy_number_unique").on(table.orgId, table.policyNumber)`.
  Everything else already has an `org_id` column plus an `*_org_id_idx` (#117), and
  `vehicles_policy_id_vin_unique` / `policy_logs_policy_id_log_number_unique` are already
  transitively org-scoped through their parent, so they stay as they are.

**Repositories (the actual work)**

- `repositories/persons.ts`, `drivers.ts`, `carriers.ts`, `vehicles.ts` — mechanical: add `orgId`,
  `and(...)` every where, set `orgId` on insert.
- `repositories/clients.ts` — same, plus `getClientWithDetails` (a `db.query.clients.findFirst`
  with five nested relations) and parent checks on `namedInsuredId` / `secondNamedInsuredId`.
- `repositories/clientPhones.ts`, `clientEmails.ts` — every function is client-keyed; each one
  also constrains the client to `orgId` (`replaceClientPhones`/`replaceClientEmails` do it inside
  their existing transaction).
- `repositories/autoPolicies.ts` — the big one: `getPolicyWithDetails`, the create/update
  transactions, and `linkPolicyDrivers` (which reads `persons`, reads/creates `drivers`, and
  inserts `policy_drivers` — all four touch points need the org).
- `repositories/policyDrivers.ts` — `listDriversForPolicy`, `listPoliciesForDriver`,
  `addDriverToPolicy`, `removeDriverFromPolicy`.
- `repositories/search.ts` — `searchClients` (5-table join) and `searchPolicies` (3-table join).
- `repositories/index.ts` — rewrite the header comment: it currently says "nothing calls into
  these functions with a caller-supplied org yet"; after this issue, the ten modules above do,
  and the rest follow in sub-issues 5-6.
- **New:** `repositories/errors.ts` — `CrossOrgReferenceError` (see Approach step 3). Export it
  from `index.ts`.

**Routes in scope**

- `routes/persons.ts`, `clients.ts`, `carriers.ts`, `policies.ts`, `vehicles.ts`, `search.ts` —
  thread `req.orgId` into every repository call. `carriers.ts` and `policies.ts` also need their
  `isPgUniqueViolation(err, "…")` constraint-name strings updated to the new composite names
  (`routes/carriers.ts:51,78`; `routes/policies.ts:110`).
- `routes/schemas.ts` — `omitMeta` is `{ id, createdAt, updatedAt }` (line 48); **add
  `orgId: true`**. Today `createPersonBody`/`createClientBody`/`createCarrierBody`/
  `createVehicleBody`/`policyCoreBody` all accept a client-supplied `orgId` (drizzle-zod makes it
  optional because the column has a default), which is exactly the body-supplied tenant
  `multitenancy.md` forbids. `CreatePolicyVehicleInput` in `autoPolicies.ts` gains `"orgId"` in
  its `Omit`.
- `routes/vinDecoder.ts` — untouched, as the issue says.

**Out-of-scope callers that must still compile** (pass the org through; do not otherwise change
their modules)

- `routes/policyLogs.ts:26`, `routes/policyAttachments.ts:124,162` — `findAutoPolicyById(req.orgId, …)`.
- `routes/accountingDocuments.ts:39-40` — `getClientWithDetails` / `findAutoPolicyById`.
- `routes/mail.ts:42,99,101` — `findClientById` / `getPolicyWithDetails` / `getClientWithDetails`.
  `resolveMergeValues(policyId, agent)` grows an `orgId` parameter.
- `jobs/dispatcher.ts:96,99` — runs outside a request, so the org comes from the row: add
  `org_id: number` to the `ClaimedRow` interface (line 47) and confirm the `update … returning`
  in `claimBatch` returns it, then pass `row.org_id`.
- `db/seed/policies.ts:145` — `createAutoPolicyWithDetails` gains the seed's org, which lets
  `reassignPoliciesToOrg` in `db/seed/run.ts:50-60` (explicitly labelled "Temporary until
  sub-issue 4") be deleted along with its call sites.

**Tests**

- `routes/{persons,clients,carriers,policies,vehicles,search}.test.ts` — one wrong-org describe each.
- `repositories/{persons,autoPolicies,policyDrivers}.test.ts` — these three build fixtures with
  bare repository calls / direct inserts rather than `TestContext`, so they need an org of their
  own (see Approach step 6).
- `routes/testHelpers.ts` — fixtures become org-aware.

**Docs**

- `docs/API.md` — the **Tenancy** conventions bullet (lines 21-26) currently says the resource
  routes "do not filter by org yet"; replace with: every resource is scoped to the session's
  organization, and a row in another organization is a `404`, never a `403`. Note the carriers
  and policies duplicate rules are now per-organization.
- `docs/multitenancy.md` — update the *Request scoping* "Not done yet (sub-issues 4-6)" bullet and
  the rollout-step-3 status line to record that the first half of the domain is scoped.
- `pipeline/119/notes.md` — pipeline convention, as with #118.

## Approach

1. **Schema first.** Make the two unique constraints composite, then `npm run db:push` and
   `npm run db:bootstrap` against this runner's database (the repo replaced migrations with
   `drizzle-kit push` in #116, so there is no migration file to write). Update the two constraint
   name strings in `routes/carriers.ts` and `routes/policies.ts`, and any test asserting a 409 on
   a duplicate NAIC/policy number.

2. **Fix the signature convention once, then apply it everywhere.** For every module:

   ```ts
   export async function findCarrierById(orgId: number, id: number): Promise<Carrier | undefined> {
     const [row] = await db
       .select()
       .from(carriers)
       .where(and(eq(carriers.id, id), eq(carriers.orgId, orgId)))
     return row
   }

   export async function createCarrier(
     orgId: number,
     input: Omit<NewCarrier, "orgId">
   ): Promise<Carrier> {
     const [row] = await db.insert(carriers).values({ ...input, orgId }).returning()
     return row
   }
   ```

   `Omit<New*, "orgId">` is what makes "the caller cannot smuggle another org in" a type error
   rather than a convention, and it pairs with the `omitMeta` change so the route body can't carry
   one either. Update-by-id keeps returning `undefined` for a row in another org, which the routes
   already turn into the existing 404.

3. **Parent checks on every write that sets a parent FK.** Add `repositories/errors.ts`:

   ```ts
   // A write whose parent row exists but belongs to another organization. Handled
   // exactly like the foreign-key violation a nonexistent parent id raises, so a
   // cross-org id is indistinguishable from a bad one.
   export class CrossOrgReferenceError extends Error {}
   ```

   Inside each repository that writes a parent FK, look the parent up with
   `and(eq(id), eq(orgId))` *in the same transaction as the write* and throw
   `CrossOrgReferenceError` when it's missing. This covers inserts **and updates**: every
   `update*Body` is a `.partial()` of the create body (`schemas.ts:69,79,170,176`) and `omitMeta`
   strips only `id`/`createdAt`/`updatedAt`, so a `PATCH` still accepts every parent FK a `POST`
   does. Then make the mapping identical to today's, per call site:

   - `app.ts:79` error handler — add a `CrossOrgReferenceError` branch next to the `23503` branch,
     returning the same `409 { error: "Referenced by or references other records" }`. This covers
     `POST /vehicles` (vehicle → policy), `POST /clients` (client → persons) and
     `addDriverToPolicy`, all of which reach the global handler today.
   - `handlePolicyWriteError` in `routes/policies.ts:105` — add a `CrossOrgReferenceError` branch
     returning the same `400 { error: "Invalid client or carrier" }` its `isPgForeignKeyViolation`
     branch returns.
   - `linkPolicyDrivers` in `autoPolicies.ts:80` — the existing `Person ${id} not found`
     `PolicyWriteError` path already gives a 400; just add `eq(persons.orgId, orgId)` to the
     lookup at line 89 so a person in another org takes that same path. Same for the
     `drivers.personId` reuse lookup at line 96 and both inserts.

   Parents to check on insert: vehicle → policy; policy → client and carrier; policy driver →
   policy and driver; phone/email → client; client → `namedInsuredId` and
   `secondNamedInsuredId`.

   The same pairs on the **update** side, checked whenever the key is present in the input (an
   absent key leaves the FK alone and needs no lookup):

   - `updateAutoPolicy` / `updateAutoPolicyWithDetails` (`autoPolicies.ts:159,177`) — `clientId`
     and `carrierId`. `handlePolicyWriteError`'s `CrossOrgReferenceError` branch, added above,
     already maps these, so the update paths need no new route wiring.
   - `updateClient` (`clients.ts:33`) — `namedInsuredId` and `secondNamedInsuredId`, same check
     as `createClient`'s.
   - `updateVehicle` (`vehicles.ts:24`) — `policyId`, same check as `createVehicle`'s, routed
     through the `app.ts` global handler.

   An org-scoped `WHERE` on the row being updated is *not* sufficient by itself: the row is ours,
   the FK we are repointing it at is not, and Postgres is satisfied either way once both rows live
   in the same table. Today a bad id raises 23503; after this issue it resolves cleanly. This is
   the gap the first revision of this plan left open — and step 4 below depends on it being
   closed.

   `updateDriver` (`drivers.ts:20`) has the same blind `.set({ ...input })` with `personId` in
   `Partial<NewDriver>`. No route exposes it today, so it is not reachable — but give it the
   `orgId` treatment and the `personId` check along with the others, so it cannot become
   reachable later without one.

4. **Relational queries.** `getClientWithDetails` and `getPolicyWithDetails` filter the root row on
   `orgId`, and each nested *many* relation gets its own org condition, e.g.:

   ```ts
   db.query.clients.findFirst({
     where: and(eq(clients.id, id), eq(clients.orgId, orgId)),
     with: {
       phones: { where: eq(clientPhones.orgId, orgId) },
       policies: { where: eq(autoPolicies.orgId, orgId) },
       // …
     },
   })
   ```

   Leave the to-*one* parents (`namedInsured`, `secondNamedInsured`, `client`, `carrier`,
   `policyDrivers.driver.person`) unfiltered: a filtered-out to-one relation comes back `null` and
   changes the non-null response shape the frontend consumes. Their org is guaranteed by step 3's
   parent checks instead — which holds only because those checks now cover updates as well as
   inserts. Had they stayed insert-only, `PATCH /policies/:id { clientId: <org B's client> }`
   would write a cross-org link the database accepts, and this unfiltered `client` relation would
   then hand back org B's name, address, phone and email on the next `GET` of a policy org A
   legitimately owns — a cross-tenant PII read reachable by any authenticated staff member,
   behind nothing but an enumerable integer id. Call this out in the PR body — it is the one
   place the "constrain every join" rule is deliberately softened, and it is load-bearing on
   step 3.

5. **Search.** `searchClients(orgId, q, limit)` adds `eq(clients.orgId, orgId)` to the outer
   `where`, `eq(persons.orgId, orgId)` / `eq(clientPhones.orgId, orgId)` /
   `eq(clientEmails.orgId, orgId)` onto the corresponding `innerJoin`/`leftJoin` conditions (as
   `and(...)`), and `eq(clients.orgId, orgId)` to the `inArray` hydration query.
   `searchPolicies(orgId, q, limit)` does the same for `autoPolicies`, `clients` and `persons`.
   Keep `addressConcat` untouched — it must stay structurally identical to the `*_addr_trgm_idx`
   expression indexes in `schema.ts` or Postgres stops using them.

6. **`TestContext` (`routes/testHelpers.ts`).** Every fixture builder (`person`, `client`,
   `carrier`, `policy`, `vehicle`, `driverLink`, `clientEmail`, `log`) resolves
   `overrides.orgId ?? (await this.defaultOrg())` and passes it as the new first argument. Add a
   public accessor (e.g. `async orgId(): Promise<number>`) over the private `defaultOrg()`, since
   the wrong-org tests need to name the session's org explicitly. `driverLink(policyId, overrides)`
   takes the org the same way. `cleanup()` is id-based and needs no change.

   With that, every existing test keeps passing unchanged: the fixture org and the cookie org are
   both the context's default org.

   The three repository test files that bypass `TestContext`
   (`repositories/persons.test.ts`, `autoPolicies.test.ts`, `policyDrivers.test.ts`) insert an
   `organizations` row in `beforeAll` (or switch to `TestContext`) and delete it in `afterAll`,
   after their existing prefix-keyed cleanup.

7. **Wrong-org route tests.** One per file, following the existing style:

   ```ts
   it("does not see a vehicle from another org", async () => {
     const user = await ctx.user("vehicles-wrongorg")     // creates + fixes the default org
     const cookie = await ctx.cookie(user.id)
     const other = await ctx.org()                        // second org
     const vehicle = await ctx.vehicle({ orgId: other.id })

     const list = await request(app).get("/vehicles").set("Cookie", cookie)
     expect(list.body.some((v: { id: number }) => v.id === vehicle.id)).toBe(false)
     expect((await request(app).get(`/vehicles/${vehicle.id}`).set("Cookie", cookie)).status).toBe(404)
     expect((await request(app).patch(`/vehicles/${vehicle.id}`).set("Cookie", cookie).send({ make: "X" })).status).toBe(404)
     expect((await request(app).delete(`/vehicles/${vehicle.id}`).set("Cookie", cookie)).status).toBe(404)
   })
   ```

   And — the case the first revision missed — one per route whose update body carries a parent
   FK, PATCHing a row the caller **owns** with an FK pointed into the other org:

   ```ts
   it("rejects a PATCH repointing a FK at another org's row", async () => {
     const user = await ctx.user("vehicles-crossorg")     // creates + fixes the default org
     const cookie = await ctx.cookie(user.id)
     const mine = await ctx.vehicle()                     // in the session's org
     const other = await ctx.org()                        // second org
     const theirPolicy = await ctx.policy({ orgId: other.id })

     const res = await request(app)
       .patch(`/vehicles/${mine.id}`)
       .set("Cookie", cookie)
       .send({ policyId: theirPolicy.id })

     expect(res.status).toBe(409)                         // app.ts CrossOrgReferenceError branch
     const after = await request(app).get(`/vehicles/${mine.id}`).set("Cookie", cookie)
     expect(after.body.policyId).toBe(mine.policyId)      // still pointing at our own policy
   })
   ```

   Same shape for `PATCH /policies/:id` with `clientId` / `carrierId` (expect `400`, via
   `handlePolicyWriteError`) and `PATCH /clients/:id` with `namedInsuredId` (expect `409`, via the
   global handler). Assert the row is **unchanged** afterwards, not just the status — a
   status-only assertion also passes against a handler that rejected for an unrelated reason.

   **Ordering trap:** `ctx.org()` sets the context's default org on its *first* call
   (`testHelpers.ts:125`), so call `ctx.user()`/`ctx.cookie()` **before** minting the second org,
   or the session lands in the "other" org and the test asserts the opposite of what it means to.

   Cross-org fixtures whose parent is in the other org must pass the whole chain
   (`ctx.vehicle({ orgId: other.id })` needs a policy in `other` too) — let the builders default
   the parent chain by passing `orgId` down, which falls out of step 6.

8. **Sweep for stragglers.** `npx tsc --noEmit` is the checklist for steps 2-7: every remaining
   error is a call site that has not been given an org yet. Nothing in the ten modules should end
   up with an `orgId` that is inferred, defaulted, or optional.

## Tests

- New: a wrong-org case in each of `routes/persons.test.ts`, `clients.test.ts`, `carriers.test.ts`,
  `policies.test.ts`, `vehicles.test.ts`, `search.test.ts` (list invisibility + 404 on
  get/patch/delete; for `search.test.ts`, a client and a policy in the other org that match the
  query are absent from both arrays).
- New: a cross-org create case at the repository level in `repositories/autoPolicies.test.ts` —
  `createAutoPolicyWithDetails` with a client (or carrier, or driver person) in another org
  rejects rather than writing a policy that straddles orgs.
- New: same-value-different-org uniqueness — two carriers with the same NAIC, and two policies with
  the same policy number, in two orgs, both succeed; a duplicate inside one org still 409s.
- Updated: `repositories/{persons,autoPolicies,policyDrivers}.test.ts` fixtures get an org.
- Run: `cd backend && npx tsc --noEmit && npx vitest run && npm run lint`. On this CI runner the
  default database is fine; on a shared dev box use a private database per CLAUDE.md, since step 1
  needs `db:push`.
- Frontend: nothing changes, so its existing lint/build is the only check — and CI's path filter
  won't even run it.

## Touches backend

yes

## Risks / open questions

- **Large mechanical diff across ~25 files.** Mitigated by `tsc`: the parameter is required and
  positional, so a missed call site cannot compile. Reviewing module-by-module (leaf tables first:
  persons/drivers/carriers → clients → policies → vehicles → search) keeps each commit legible.
- **The `org_id DEFAULT 1` is still in place** until sub-issue 6, so a forgotten insert fails
  silently into org 1 rather than erroring. `Omit<New*, "orgId">` plus the required parameter is
  the defense until the default is dropped.
- **`db:push` rewrites two unique constraints.** Dropping `carriers_naic_unique` /
  `auto_policies_policy_number_unique` and adding the composites is data-preserving, but a
  production rollout on a database that already has rows should be sequenced deliberately (the
  same caveat #117's PR body records).
- **To-one relations in the `with:` trees are not org-filtered** (step 4). Justified by response
  shape and upheld by step 3's parent checks on **both** inserts and updates, but it is a genuine
  softening of the issue's rule 3 and should be reviewed explicitly. The dependency is strict: if
  any write path that sets one of these FKs ever skips its org check, this is the relation that
  serves the other org's row. RLS (sub-issue 7) is the backstop.
- **`jobs/dispatcher.ts` runs without a request.** Taking the org from the claimed
  `scheduled_emails` row is correct, but the dispatcher/planner as a whole is sub-issue 6 — this
  issue only does the minimum to keep it compiling and correct.
- **Open:** should `GET /policies?clientId=<other org's client>` and
  `GET /vehicles?policyId=<other org's policy>` return `200 []` or `404`? Planned answer: `200 []`,
  because the filter is a list filter and the rule is "invisible to list" — but it is a visible
  API decision worth confirming in review.
- **Open:** whether to also make the `409` message for a cross-org parent distinct from the FK one.
  Planned answer: no — identical, because a distinguishable message is itself a cross-tenant
  existence oracle.

## Out of scope

- `repositories/policyLogs.ts`, `policyAttachments.ts`, `policyLogAttachments.ts`, `invoices.ts`,
  `payments.ts`, `receipts.ts`, `trustLedger.ts` and their routes (sub-issue 5) — only their call
  sites *into* this issue's functions change.
- `emailTemplates.ts`, `emailLog.ts`, `reminderRules.ts`, `scheduledEmails.ts`, the reminder
  planner/scheduler, `org/<org_id>/…` storage keys, and dropping the temporary `org_id` column
  defaults (sub-issue 6).
- Row-level security (sub-issue 7) and all frontend work (sub-issue 8).
- Per-organization invoice/receipt numbering (rollout step 4) — those composite uniques already
  exist in the schema and are not touched here.
- `routes/vinDecoder.ts`, which is stateless.
