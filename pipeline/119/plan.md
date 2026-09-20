---
issue: 119
status: pending-review
---

# Multi-tenant 5/9: org-scope repositories and routes, part 1 (people, clients, carriers, policies, vehicles, search)

## Goal

Isolation layer 1 for the first half of the domain, written against the **opaque 22-char string
row ids** that #130 landed (`rowIdPk`/`rowIdFk`, `backend/src/db/ids.ts`) — the previous revision
of this file assumed integer ids and is discarded. When this is done:

- Every exported function in `repositories/{persons,drivers,clients,clientPhones,clientEmails,
  carriers,autoPolicies,policyDrivers,vehicles,search}.ts` takes `orgId: string` as its **first**
  parameter. `tsc` fails if a caller forgets it, and insert inputs are `Omit<New*, "orgId">` so a
  caller cannot pass a *different* org in the body either.
- Every `select`/`update`/`delete` in those modules `and()`s `eq(table.orgId, orgId)` onto its
  where clause; every insert sets `orgId` from the parameter, never from caller data.
- A row in another org behaves exactly like a row that does not exist: invisible to list and
  search, `404` on get/patch/delete. Never `403`, never a distinguishable message. This lines up
  with what `parseId` (`routes/helpers.ts`) already does for a malformed id.
- Every write that sets a parent FK — **create and `PATCH` alike** — verifies the parent belongs
  to the same org inside the repository, and a cross-org parent produces exactly the status a
  nonexistent parent id produces today (`409 "Referenced by or references other records"` from
  the `app.ts` handler for a plain FK; `400 "Invalid client or carrier"` /
  `400 "Person <id> not found"` on the policy routes).
- `carriers.naic` and `auto_policies.policy_number` are unique per `(org_id, …)` instead of
  globally, so two agencies can hold the same carrier or policy number.
- Routes pass `req.orgId` (`requireAuth` sets it — `auth/middleware.ts`, sub-issue 3, merged).
  Response shapes are byte-identical, so no frontend change.
- Each of the six route test files gains wrong-org cases; the backend suite is green.

**Base.** `agent/issue-119` currently branches from *before* #130, so its tree still has integer
ids and none of `repositories/*` matches this plan. Rebase onto (or re-cut the branch from) `main`
at `22c8c82` or later before writing code; every file reference below is to `main`.

## Scope check

PROJECT.md **Direction item 2** ("organization-scoped repositories"), and the *repository/route
half* of `docs/multitenancy.md` rollout step 3, which the doc records as "Not done yet (sub-issues
4-6)". This issue does the first half of that half; sub-issue 6 (logs, attachments, accounting) and
7 (email, reminders, scheduler, storage keys, restoring `org_id NOT NULL`) finish it.

Dependencies verified as merged on `main`:

- Sub-issue 3 — `requireAuth` sets `req.orgId`/`req.membership` and 403s `ORG_REQUIRED` without an
  org (`backend/src/auth/middleware.ts:49-72`); `TestContext` has `org()`, `user(prefix, role,
  orgId?)` and `cookie(userId, orgId?)` (`backend/src/routes/testHelpers.ts:119-152`).
- Sub-issue 4 (#130) — all ids are `varchar(22)` (`backend/src/db/ids.ts`), route params are
  validated by `idParam` and 404 on a malformed value, and `MISSING_ROW_ID` exists for
  "well-formed but absent" tests.

One material difference from the pre-#130 state: `org_id` is now **nullable with no column
default** (`schema.ts`: "Nullable until #121 restores NOT NULL once every insert passes an explicit
org id"). There is no longer an `org_id DEFAULT 1` catching un-scoped inserts, so a forgotten
insert writes `NULL` and the row is invisible to every org — a loud failure in tests rather than a
silent cross-tenant one. `Omit<New*, "orgId">` plus the required parameter remains the defense.

Triage labels look right: `enhancement`, `agent`, `pipeline:needs-plan`, `area:backend`. No
`area:frontend` — response shapes are unchanged and the frontend work is sub-issue 9.

## Files / areas

**Schema (per-org uniques)**

- `backend/src/db/schema.ts` — `carriers.naic` (line ~398) drops `.unique()`; the `carriers` extras
  array gains `unique("carriers_org_id_naic_unique").on(table.orgId, table.naic)`.
  `autoPolicies.policyNumber` (line ~424) drops `.unique()` and gains
  `unique("auto_policies_org_id_policy_number_unique").on(table.orgId, table.policyNumber)`.
  Everything else already has `org_id` plus an `*_org_id_idx` (#117);
  `vehicles_policy_id_vin_unique`, `policy_logs_policy_id_log_number_unique` and
  `drivers.person_id` unique are transitively org-scoped through their parent and stay as they are.

**Repositories (the actual work)**

- `persons.ts`, `drivers.ts`, `carriers.ts`, `vehicles.ts` — mechanical: add `orgId`, `and(...)`
  every where, set `orgId` on insert. Plus the parent check on `vehicles.policyId` and
  `drivers.personId` (see Approach 3).
- `clients.ts` — same, plus `getClientWithDetails` (a `db.query.clients.findFirst` with five nested
  relations) and parent checks on `namedInsuredId` / `secondNamedInsuredId`.
- `clientPhones.ts`, `clientEmails.ts` — every function is client-keyed; each also constrains the
  client to `orgId` (`replaceClientPhones`/`replaceClientEmails` inside their existing
  transaction), and `deletePhone`/`deleteEmail` filter the row itself on `org_id`.
- `autoPolicies.ts` — the big one: `getPolicyWithDetails`, `createAutoPolicyWithDetails`,
  `updateAutoPolicy`, `updateAutoPolicyWithDetails`, and `linkPolicyDrivers` (which reads
  `persons`, reads/creates `drivers`, and inserts `policy_drivers` — all four touch points need
  the org).
- `policyDrivers.ts` — `listDriversForPolicy`, `listPoliciesForDriver`, `addDriverToPolicy`,
  `removeDriverFromPolicy`.
- `search.ts` — `searchClients` (5-table join + hydration `findMany`) and `searchPolicies`
  (3-table join).
- `index.ts` — rewrite the header comment: it currently says "nothing calls into these functions
  with a caller-supplied org yet"; after this issue the ten modules above do, and the rest follow
  in sub-issues 6-7.
- **New:** `repositories/errors.ts` — `CrossOrgReferenceError` (Approach 3), re-exported from
  `index.ts`.

**Routes in scope**

- `routes/persons.ts`, `clients.ts`, `carriers.ts`, `policies.ts`, `vehicles.ts`, `search.ts` —
  thread `req.orgId` into every repository call.
- Constraint-name strings move to the composite names: `routes/carriers.ts` (`carriers_naic_unique`
  → `carriers_org_id_naic_unique`, both the POST and PATCH handlers) and `routes/policies.ts`
  `handlePolicyWriteError` (`auto_policies_policy_number_unique` → `auto_policies_org_id_policy_
  number_unique`).
- `routes/schemas.ts` — `omitMeta` is `{ id, createdAt, updatedAt }`; **add `orgId: true`**. Today
  `createPersonBody`/`createClientBody`/`createCarrierBody`/`createVehicleBody`/`policyCoreBody`
  all still accept a client-supplied `orgId` (drizzle-zod makes it optional because the column is
  nullable) — exactly the body-supplied tenant `multitenancy.md` forbids.
  `CreatePolicyVehicleInput` in `autoPolicies.ts` gains `"orgId"` in its `Omit`.
- `routes/vinDecoder.ts` — untouched, as the issue says.
- `app.ts` — a `CrossOrgReferenceError` branch in the error handler (Approach 3).

**Out-of-scope callers that must still compile** (pass the org through; change nothing else in
their modules)

- `routes/policyLogs.ts:26`, `routes/policyAttachments.ts:124,162` — `findAutoPolicyById(req.orgId, …)`.
- `routes/accountingDocuments.ts:39-40` — `getClientWithDetails` / `findAutoPolicyById`.
- `routes/mail.ts:42,99,101` — `findClientById` / `getPolicyWithDetails` / `getClientWithDetails`.
- `jobs/dispatcher.ts:96,99` — runs outside a request, so the org comes from the claimed row: add
  `org_id: string` to the `ClaimedRow` interface (~line 47) and `org_id` to the `returning` list in
  `claimBatch`'s raw SQL, then pass `row.org_id`.
- `db/seed/policies.ts:145` — `createAutoPolicyWithDetails` gains the seed's org, which lets
  `reassignPoliciesToOrg` in `db/seed/run.ts:50-60` (labelled "Temporary until sub-issue 4 threads
  orgId through the policy repositories directly") be deleted along with its call sites. The seed
  already creates a second org, so this is the point where its policies land in the right org
  directly.
- `db/bootstrap.ts` — check for any domain insert that now needs an org argument.

**Tests**

- `routes/{persons,clients,carriers,policies,vehicles,search}.test.ts` — wrong-org cases.
- `repositories/{persons,autoPolicies,policyDrivers}.test.ts` — these three build fixtures with bare
  repository calls rather than `TestContext`, so they need an org of their own (Approach 6).
- `routes/testHelpers.ts` — fixtures become org-aware.

**Docs**

- `docs/API.md` — the **Tenancy** conventions bullet (~lines 21-26) currently says the resource
  routes "do not filter by org yet". Replace with: every resource is scoped to the session's
  organization, and a row in another organization answers exactly as a missing row does (404 on
  get/patch/delete, absent from lists and search), never 403. Note that duplicate NAIC / duplicate
  policy number are now per-organization.
- `docs/multitenancy.md` — update the *Request scoping* "Not done yet (sub-issues 4-6)" bullet and
  the rollout-step-3 status line to record that the first half of the domain is scoped.
- `pipeline/119/notes.md` — pipeline convention, as with #118/#130.

## Approach

1. **Schema first.** Make the two unique constraints composite, then `npm run db:push` and
   `npm run db:bootstrap` against this runner's database (#116 replaced migrations with
   `drizzle-kit push`, so there is no migration file). Update the two constraint-name strings in
   `routes/carriers.ts` and `routes/policies.ts`, plus any test asserting a 409 on a duplicate NAIC
   or policy number.

2. **Fix the signature convention once, then apply it everywhere.** For every module:

   ```ts
   export async function findCarrierById(orgId: string, id: string): Promise<Carrier | undefined> {
     const [row] = await db
       .select()
       .from(carriers)
       .where(and(eq(carriers.id, id), eq(carriers.orgId, orgId)))
     return row
   }

   export async function createCarrier(
     orgId: string,
     input: Omit<NewCarrier, "orgId">
   ): Promise<Carrier> {
     const [row] = await db.insert(carriers).values({ ...input, orgId }).returning()
     return row
   }
   ```

   `Omit<New*, "orgId">` is what makes "the caller cannot smuggle another org in" a type error
   rather than a convention, and it pairs with the `omitMeta` change so a request body can't carry
   one either. Update-by-id keeps returning `undefined` for a row in another org, which the routes
   already turn into their existing 404. Both ids are now strings, so a wrong-org id and a
   nonexistent id are equally unguessable — but the 404 mapping still matters, since a caller can
   hold an id it legitimately learned before a membership changed.

3. **Parent checks on every write that sets a parent FK — inserts *and* updates.** Add
   `repositories/errors.ts`:

   ```ts
   // A write whose parent row exists but belongs to another organization. Handled
   // exactly like the foreign-key violation a nonexistent parent id raises, so a
   // cross-org id is indistinguishable from a bad one.
   export class CrossOrgReferenceError extends Error {}
   ```

   Inside each repository that writes a parent FK, look the parent up with
   `and(eq(<table>.id, parentId), eq(<table>.orgId, orgId))` *in the same transaction as the write*
   and throw `CrossOrgReferenceError` when it is missing. A single-statement update
   (`updateVehicle`, `updateClient`) gets wrapped in `db.transaction` so the check and the `SET`
   cannot straddle a concurrent move. Pairs to check:

   | write | parent(s) |
   | --- | --- |
   | `createVehicle` / `updateVehicle` | `policyId` → `auto_policies` |
   | `createAutoPolicy` / `createAutoPolicyWithDetails` / `updateAutoPolicy` / `updateAutoPolicyWithDetails` | `clientId` → `clients`, `carrierId` → `carriers` |
   | `addDriverToPolicy` | `policyId` → `auto_policies`, `driverId` → `drivers` |
   | `addPhoneToClient` / `addEmailToClient` / `replaceClientPhones` / `replaceClientEmails` | `clientId` → `clients` |
   | `createClient` / `updateClient` | `namedInsuredId`, `secondNamedInsuredId` → `persons` |
   | `createDriver` / `updateDriver` | `personId` → `persons` |
   | `linkPolicyDrivers` ("existing" spec) | `personId` → `persons`, and the `drivers` reuse lookup |

   On the update side the check runs only when the key is **present** in the input; an absent key
   leaves the FK alone and needs no lookup.

   This is the gap the previous plan review rejected the earlier revision over, and step 4 below
   depends on it being closed. An org-scoped `WHERE` on the row being updated is *not* sufficient
   by itself: the row is ours, the FK we are repointing it at is not, and Postgres is satisfied
   either way once both rows live in the same table. Every `update*Body` is a `.partial()` of the
   create body (`routes/schemas.ts`) and `omitMeta` strips only `id`/`createdAt`/`updatedAt`, so a
   `PATCH` still accepts every parent FK a `POST` does.

   Then make the response mapping identical to today's, per call site:

   - `app.ts` error handler — add a `CrossOrgReferenceError` branch next to the `23503` branch,
     returning the same `409 { error: "Referenced by or references other records" }`. This covers
     `POST`/`PATCH /vehicles` (vehicle → policy), `POST`/`PATCH /clients` (client → persons) and
     `addDriverToPolicy`, all of which reach the global handler today.
   - `handlePolicyWriteError` in `routes/policies.ts` — add a `CrossOrgReferenceError` branch
     returning the same `400 { error: "Invalid client or carrier" }` its `isPgForeignKeyViolation`
     branch returns. This covers both the create and update policy paths, so no new route wiring.
   - `linkPolicyDrivers` — the existing `Person ${id} not found` `PolicyWriteError` already yields
     a 400; just add `eq(persons.orgId, orgId)` to the person lookup so a person in another org
     takes that same path, plus the org condition on the `drivers.personId` reuse lookup and
     `orgId` on both inserts.

   `updateDriver` is not reachable from any route today; give it the same treatment anyway so it
   cannot become reachable later without one.

4. **Relational queries.** `getClientWithDetails` and `getPolicyWithDetails` filter the root row on
   `orgId`, and each nested *many* relation gets its own org condition:

   ```ts
   db.query.clients.findFirst({
     where: and(eq(clients.id, id), eq(clients.orgId, orgId)),
     with: {
       phones: { where: eq(clientPhones.orgId, orgId) },
       emails: { where: eq(clientEmails.orgId, orgId) },
       policies: { where: eq(autoPolicies.orgId, orgId) },
       // …
     },
   })
   ```

   Leave the to-*one* parents (`namedInsured`, `secondNamedInsured`, `client`, `carrier`,
   `policyDrivers.driver.person`) unfiltered — drizzle's relational `with` doesn't take a `where`
   on a one-relation anyway, and a filtered-out to-one would come back `null` and break the
   non-null response shape the frontend consumes. Their org is guaranteed by step 3's parent
   checks instead — which holds **only because those checks now cover updates as well as inserts**.
   Had they stayed insert-only, `PATCH /policies/:id { clientId: <org B's client> }` would write a
   cross-org link the database accepts, and this unfiltered `client` relation would hand back org
   B's name, address, phone and email on the next `GET` of a policy org A legitimately owns. Call
   this out in the PR body: it is the one place the issue's "constrain every join" rule is
   deliberately softened, and it is load-bearing on step 3.

5. **Search.** `searchClients(orgId, q, limit)` adds `eq(clients.orgId, orgId)` to the outer
   `where`, `and()`s `eq(persons.orgId, orgId)` / `eq(secondInsured.orgId, orgId)` /
   `eq(clientPhones.orgId, orgId)` / `eq(clientEmails.orgId, orgId)` onto the corresponding
   `innerJoin`/`leftJoin` conditions, and scopes the `inArray` hydration `findMany` (root plus its
   `phones`/`emails` many-relations). `searchPolicies(orgId, q, limit)` does the same for
   `autoPolicies`, `clients` and `persons`. Keep `addressConcat` untouched — it must stay
   structurally identical to the `*_addr_trgm_idx` expression indexes in `schema.ts` or Postgres
   stops using them.

6. **`TestContext` (`routes/testHelpers.ts`).** Every fixture builder (`person`, `client`,
   `carrier`, `policy`, `vehicle`, `driverLink`, `clientEmail`, `log`) resolves
   `overrides.orgId ?? (await this.defaultOrg())` and passes it as the new first argument. Add a
   public accessor (e.g. `async orgId(): Promise<string>`) over the private `defaultOrg()`, since
   the wrong-org tests need to name the session's org explicitly. `driverLink(policyId, overrides)`
   and `clientEmail(clientId, …)` take the org the same way. `cleanup()` is id-based and needs no
   change. With that, every existing test keeps passing unchanged: the fixture org and the cookie
   org are both the context's default org.

   The three repository test files that bypass `TestContext`
   (`repositories/persons.test.ts`, `autoPolicies.test.ts`, `policyDrivers.test.ts`) insert an
   `organizations` row in `beforeAll` (or switch to `TestContext`) and delete it in `afterAll`,
   after their existing prefix-keyed cleanup.

7. **Wrong-org route tests.** One invisibility case per file, following the existing style:

   ```ts
   it("does not see a vehicle from another org", async () => {
     const user = await ctx.user("vehicles-wrongorg")     // creates + fixes the default org
     const cookie = await ctx.cookie(user.id)
     const other = await ctx.org()                        // second org
     const vehicle = await ctx.vehicle({ orgId: other.id })

     const list = await request(app).get("/vehicles").set("Cookie", cookie)
     expect(list.body.some((v: { id: string }) => v.id === vehicle.id)).toBe(false)
     expect((await request(app).get(`/vehicles/${vehicle.id}`).set("Cookie", cookie)).status).toBe(404)
     expect((await request(app).patch(`/vehicles/${vehicle.id}`).set("Cookie", cookie).send({ make: "X" })).status).toBe(404)
     expect((await request(app).delete(`/vehicles/${vehicle.id}`).set("Cookie", cookie)).status).toBe(404)
   })
   ```

   Plus, per route whose update body carries a parent FK, a case that `PATCH`es a row the caller
   **owns** with an FK pointed into the other org (issue test item 5):

   ```ts
   it("rejects a PATCH repointing a FK at another org's row", async () => {
     const user = await ctx.user("vehicles-crossorg")
     const cookie = await ctx.cookie(user.id)
     const mine = await ctx.vehicle()                     // in the session's org
     const other = await ctx.org()
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

   Cross-org fixtures must carry the whole parent chain (`ctx.vehicle({ orgId: other.id })` needs
   its policy, client, person and carrier in `other` too) — let the builders push `orgId` down the
   default chain, which falls out of step 6.

8. **Sweep for stragglers.** `npx tsc --noEmit` is the checklist for steps 2-7: every remaining
   error is a call site that has not been given an org yet. Nothing in the ten modules should end
   up with an `orgId` that is inferred, defaulted, or optional. Land it in reviewable commits, leaf
   tables first: schema+constraints → persons/drivers/carriers → clients/phones/emails → policies
   → vehicles → search → routes → tests → docs.

## Tests

- New: a wrong-org invisibility case in each of `routes/persons.test.ts`, `clients.test.ts`,
  `carriers.test.ts`, `policies.test.ts`, `vehicles.test.ts`, `search.test.ts` (absent from list,
  404 on get/patch/delete; for `search.test.ts`, a client and a policy in the other org that match
  the query are absent from both arrays).
- New: cross-org `PATCH` rejection + row-unchanged assertions on `/vehicles/:id` (`policyId`),
  `/policies/:id` (`clientId`, `carrierId`) and `/clients/:id` (`namedInsuredId`).
- New: a cross-org create case at the repository level in `repositories/autoPolicies.test.ts` —
  `createAutoPolicyWithDetails` with a client (or carrier, or driver person) in another org
  rejects rather than writing a policy that straddles orgs.
- New: same-value-different-org uniqueness — two carriers with the same NAIC, and two policies with
  the same policy number, in two orgs, both succeed; a duplicate inside one org still 409s with the
  existing message.
- Updated: `repositories/{persons,autoPolicies,policyDrivers}.test.ts` fixtures get an org;
  `routes/testHelpers.ts` builders become org-aware.
- Run: `cd backend && npx tsc --noEmit && npx vitest run && npm run lint && npm run format:check`.
  Step 1 needs `db:push`, so on a shared dev box use a private database per CLAUDE.md; on this CI
  runner the default database is fine.
- Frontend: nothing changes, so its existing lint/build is the only check — and CI's path filter
  won't even run it.

## Touches backend

yes

## Risks / open questions

- **Large mechanical diff across ~25 files.** Mitigated by `tsc`: the parameter is required and
  positional, so a missed call site cannot compile. Commit module-by-module (step 8) to keep review
  legible.
- **`org_id` is nullable with no default** until #121 (sub-issue 7). A forgotten insert now writes
  `NULL` rather than landing in org 1, which makes the row invisible to everyone instead of
  visible to the wrong tenant — safer, but it can strand rows created by the still-unscoped
  sub-issue 6/7 modules. That is expected and is those issues' job to finish.
- **`db:push` rewrites two unique constraints.** Dropping `carriers_naic_unique` /
  `auto_policies_policy_number_unique` and adding the composites is data-preserving, but a
  production rollout against a database that already has rows should be sequenced deliberately
  (the same caveat #117's PR body records).
- **To-one relations in the `with:` trees are not org-filtered** (step 4). Justified by response
  shape and by drizzle's API, and upheld by step 3's parent checks on **both** inserts and updates,
  but it is a genuine softening of the issue's rule 3 and should be reviewed explicitly. If any
  write path that sets one of these FKs ever skips its org check, this is the relation that serves
  the other org's row. RLS (sub-issue 8) is the backstop.
- **`jobs/dispatcher.ts` runs without a request.** Taking the org from the claimed
  `scheduled_emails` row is correct, but the dispatcher/planner as a whole is sub-issue 7 — this
  issue does the minimum to keep it compiling and correct. `scheduled_emails.org_id` is itself
  nullable today, so decide at implementation time whether the dispatcher skips a row with a null
  org (preferred: skip and log, it cannot be sent correctly) or falls back to the policy's org.
- **Open:** should `GET /policies?clientId=<other org's client>` and
  `GET /vehicles?policyId=<other org's policy>` return `200 []` or `404`? Planned answer: `200 []`,
  because the filter is a list filter and the rule is "invisible to list" — it falls out of the
  org condition for free, but it is a visible API decision worth confirming in review.
- **Open:** whether a cross-org parent should get a message distinct from the plain FK one.
  Planned answer: no — identical, because a distinguishable message is itself a cross-tenant
  existence oracle.

## Out of scope

- `repositories/policyLogs.ts`, `policyAttachments.ts`, `policyLogAttachments.ts`, `invoices.ts`,
  `payments.ts`, `receipts.ts`, `trustLedger.ts` and their routes (sub-issue 6) — only their call
  sites *into* this issue's functions change.
- `emailTemplates.ts`, `emailLog.ts`, `reminderRules.ts`, `scheduledEmails.ts`, the reminder
  planner/scheduler, `org/<org_id>/…` storage keys, and restoring `org_id NOT NULL` (sub-issue 7).
- Row-level security (sub-issue 8) and all frontend work (sub-issue 9).
- Per-organization invoice/receipt numbering — those composite uniques already exist in the schema
  and are not touched here.
- `routes/vinDecoder.ts`, which is stateless.
