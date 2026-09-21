---
issue: 122
status: pending-review
---
# Row-level security backstop and cross-tenant test suite

## Goal

Isolation layer 2 is live: even a repository that forgot its `where org_id = …`
cannot return another organization's rows, because Postgres refuses to show
them to the `app` role.

Done means:

- `backend/src/db/rls.ts` exists, runs as part of `db:push` after `roles.ts`, is
  idempotent, and enables + forces RLS with an `app`-role policy on all 21
  tenant tables (`organizations` gets a `SELECT`-only policy; `users`,
  `sessions`, `org_memberships` stay unprotected).
- A request carries its org into the database: `requireAuth` opens an
  `AsyncLocalStorage` scope holding a transaction on one pooled connection with
  `app.org_id` set, and the `db` every repository already imports resolves
  through it.
- `SELECT` on any tenant table as `app` with no `app.org_id` set returns zero
  rows (asserted by a test).
- A deliberately unfiltered raw query through `db` inside an org-A request
  context returns no org-B rows; the same query through `adminDb` returns both.
- `backend/src/routes/crossTenant.test.ts` drives a table of every org-scoped
  endpoint and fails when a route has no entry.
- Owner-side code (push, roles, rls, bootstrap, seed, scheduler,
  `automationUser`) still uses `adminDb`, and an ESLint rule stops `adminDb`
  leaking anywhere else.
- Full backend suite, lint, typecheck and format-check green.
- `docs/multitenancy.md` rewritten as a description of what is built; `CLAUDE.md`
  gains the orgId/`adminDb` rule.

The issue is specific enough to plan concretely. Two of its instructions
conflict with code as it stands today — the `organizations` SELECT policy vs.
the org picker, and `TestContext.org()` inserting through `db` — both are
resolved under *Approach* and flagged under *Risks*.

## Scope check

PROJECT.md direction item 2 ("make the app multitenant") and
`docs/multitenancy.md`'s rollout order item 9, *Row-level security backstop
(#122)* — the last backend step of the multi-tenant series. Its stated
dependency (sub-issue 7/9, #121: every repository org-scoped, `org_id` `NOT
NULL` with no default) is merged: `0ad45ff` merged `agent/issue-121`, and
`docs/multitenancy.md` records #119/#120/#121 as done.

Triage labels look right: `enhancement`, `area:backend`. `area:frontend` is
correctly absent — frontend is sub-issue 9. Worth noting the label set does not
convey that this issue touches *every* backend test file's fixture path; it is
a large change despite reading like an infrastructure add-on.

## Files / areas

New:

- `backend/src/db/pools.ts` — the two `pg.Pool`s and the two raw drizzle
  handles (`appDb`, `adminDb`), moved out of `index.ts` so `context.ts` can
  import them without an import cycle.
- `backend/src/db/context.ts` — `AsyncLocalStorage`, `runInOrg()`,
  `currentOrgId()`, and the `db` proxy.
- `backend/src/db/rls.ts` — the policy script.
- `backend/src/db/rls.test.ts` — the RLS proof test.
- `backend/src/routes/crossTenant.test.ts` — the table-driven cross-tenant
  suite.

Changed:

- `backend/src/db/index.ts` — becomes a re-export barrel (`db` from
  `./context`, `adminDb` from `./pools`) so the ~40 existing
  `import { db } from "../db"` call sites are untouched.
- `backend/src/auth/middleware.ts` — `requireAuth` opens the org context.
- `backend/src/routes/testHelpers.ts` — fixture builders run in `runInOrg`;
  `org()` and `cleanup()` run on `adminDb`.
- `backend/src/repositories/*.test.ts`, `src/emails.test.ts`,
  `src/jobs/reminders.test.ts`, `src/db/schema.test.ts` and any other test
  calling a repository directly — wrap those calls in `runInOrg`.
- `backend/package.json` — `db:push` gains `&& ts-node src/db/rls.ts`.
- `backend/eslint.config.js` — `no-restricted-imports` for `adminDb`.
- `backend/.env.example` — `DB_POOL_MAX` and a note on connection pinning.
- `docs/multitenancy.md` — rewritten (see step 9).
- `CLAUDE.md` — new short rule.
- `docs/API.md` — only if a response or status code changes (it should not).

Deliberately unchanged: `src/jobs/*` (already on `adminDb`), `src/db/bootstrap.ts`,
`src/db/seed/*`, `src/db/backfillOrgIds.ts`, `src/db/extensions.ts`,
`src/db/roles.ts`.

## Approach

**1. Split the db module (no behaviour change).**
`pools.ts` keeps today's `index.ts` body but exports `appDb` and `adminDb`.
`index.ts` becomes `export { adminDb } from "./pools"` + `export { db, runInOrg }
from "./context"`. Set `max` on the app pool:
`max: Number(process.env.DB_POOL_MAX ?? 20)`. Keep the existing explanatory
comment, updated: it currently says "until RLS lands" in three places.

**2. `db/context.ts`.**

```ts
const store = new AsyncLocalStorage<{ orgId: string; tx: NodePgTx }>()

export async function runInOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const active = store.getStore()
  if (active) {
    if (active.orgId !== orgId) throw new Error("Nested runInOrg for a different org")
    return fn()                       // already scoped; reuse the open transaction
  }
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`)
    return store.run({ orgId, tx }, fn)
  })
}
```

`set_config(…, true)` rather than `SET LOCAL app.org_id = $1`: `SET` takes a
literal, not a bind parameter. `roles.ts` already uses exactly this trick and
its comment explains why — cite it rather than re-deriving it.

`db` is a `Proxy` over `appDb` whose `get` trap returns the member from
`store.getStore()?.tx ?? appDb`, binding functions to that handle so drizzle's
internal `this` is right. Typed as
`NodePgDatabase<typeof schema & typeof relations>` so every call site keeps its
current types. This is what makes the existing `import { db }` call sites
resolve through the store; `db.transaction(…)` inside a request becomes a
savepoint (drizzle's `PgTransaction.transaction`), which is the correct
semantics for the repositories that already use it (`payments`, `invoices`,
`autoPolicies`, `clients`, …).

**3. `requireAuth` opens the context.**
After `req.orgId`/`req.membership` are resolved (the session/membership lookups
above stay on the unscoped pool — those tables are not RLS-protected), wrap the
rest of the request:

```ts
await runInOrg(req.orgId, () =>
  new Promise<void>((resolve, reject) => {
    res.on("close", resolve)          // fires on finish and on abort
    next((err?: unknown) => (err ? reject(err) : resolve()))
  })
).catch((err) => { /* log; res already sent or delegate to the error handler */ })
```

The transaction commits when the response is done. Two consequences to
implement deliberately:

- A handler that lets a pg error escape leaves the transaction aborted;
  Postgres turns the subsequent `COMMIT` into a rollback without raising, so
  the wrapper must not crash on it, and the request's earlier writes are
  correctly discarded.
- Handlers that *catch* a pg error and keep querying would hit "current
  transaction is aborted". Audit the catch sites —
  `routes/carriers.ts:51,78,107`, `routes/policies.ts:115-123`,
  `routes/reminderRules.ts:61,103`, `routes/users.ts:93` — and confirm each
  returns immediately. Where one does not, wrap the failing statement in an
  inner `db.transaction` so the abort is scoped to a savepoint.

**4. `db/rls.ts`.** Runs on `adminDb`, one statement per table, all idempotent
(`ALTER TABLE … ENABLE/FORCE ROW LEVEL SECURITY` is idempotent; policies need
`DROP POLICY IF EXISTS <name>` then `CREATE POLICY`). Drive it from a literal
list of the 21 tenant tables rather than reflection, so adding a table is a
visible edit:

`persons, drivers, clients, client_phones, client_emails, carriers,
auto_policies, vehicles, policy_drivers, policy_logs, policy_attachments,
policy_log_attachments, invoices, invoice_items, payments, receipts,
trust_ledger, email_templates, email_log, reminder_rules, scheduled_emails`

Per table:

```sql
ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <t> FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS <t>_org_isolation ON <t>;
CREATE POLICY <t>_org_isolation ON <t> FOR ALL TO app
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
```

No `::int` cast — `org_id` is `varchar(22)` since #130, and
`current_setting(…)` is already `text`. Unset ⇒ `NULL` ⇒ the predicate is
`NULL` ⇒ zero rows, which is acceptance criterion 1. `organizations` gets
`ENABLE`/`FORCE` plus a `FOR SELECT` policy on `id = current_setting(…)` only.
Add a completeness guard in the same script: query
`information_schema.columns` for `public` tables having an `org_id` column and
throw if any is missing from the list, so a future tenant table cannot be added
without a policy.

`FORCE` also binds the table owner, so it matters that `DATABASE_ADMIN_URL` is
the `postgres` superuser (`.env.example`, `docker-compose.yml`, `ci.yml` all
use it) — superusers bypass RLS regardless. Say so in the file comment; it is
the one assumption that would break `adminDb` on a managed Postgres where the
owner is not a superuser.

Wire it into `package.json`: `"db:push": "… drizzle-kit push --force && ts-node
src/db/roles.ts && ts-node src/db/rls.ts"`. CI already runs `npm run db:push`
(`.github/workflows/ci.yml:75`), so CI picks it up with no workflow edit.

**5. `adminDb` lockdown.** In `eslint.config.js`, add to the base rules block:

```js
"no-restricted-imports": ["error", { patterns: [{
  group: ["**/db", "**/db/index", "**/db/pools"],
  importNames: ["adminDb"],
  message: "adminDb bypasses RLS. Use db; owner-side code lives in db/, jobs/, and the seed.",
}]}],
```

with an override turning it off for `src/db/**`, `src/jobs/**`,
`src/routes/testHelpers.ts` and `**/*.test.ts`. The last two are additions to
what the issue lists and are unavoidable: `cleanup()` and the RLS proof both
need the owner handle.

**6. `TestContext`.**

- `org()` inserts into `organizations` — under the SELECT-only policy the `app`
  role cannot insert, so this moves to `adminDb` (as does the
  `upsertEmailTemplate` seeding inside it, via `runInOrg(o.id, …)` — that one
  is a tenant row and can stay on `db`).
- Every fixture builder (`person`, `client`, `carrier`, `policy`, `vehicle`,
  `driverLink`, `log`, `clientEmail`, `template`, `reminderRule`) wraps its
  repository call in `runInOrg(resolvedOrgId, …)`; they already compute
  `resolvedOrgId` first, so this is a one-line wrap each.
- `cleanup()` switches wholesale to `adminDb`: its deletes are by id with no
  org predicate and would silently delete nothing under RLS, leaving fixtures
  behind and breaking FK order for the next test.
- `user()`/`cookie()`/`makeSessionCookie` touch `users`, `org_memberships`,
  `sessions` only — unprotected, no change.
- Export `runInOrg` from `testHelpers` too, so repository-level tests
  (`repositories/{persons,autoPolicies,policyDrivers,organizations,
  orgMemberships,sessions}.test.ts`, `emails.test.ts`, `jobs/reminders.test.ts`,
  `db/schema.test.ts`) have one obvious import to wrap their direct calls with.
  Expect a mechanical sweep here; run the suite and fix what fails.

**7. `routes/crossTenant.test.ts`.** One user, two orgs (`ctx.org()` twice),
memberships in both, a cookie bound to each. Fixtures built in org B, requests
made with the org-A cookie. A single exported table:

```ts
type Case = {
  method, path,                    // path may contain :id placeholders
  kind: "list" | "detail" | "create-with-parent" | "exempt",
  setup?: (ctx, orgB) => Promise<{ params, body, absentMarker }>,
  reason?: string,                 // required when kind === "exempt"
}
```

Coverage by kind:

- **list** — `/persons`, `/clients`, `/policies`, `/vehicles`, `/carriers`,
  `/invoices`, `/payments`, `/receipts`, `/policy-logs`, `/policy-attachments`,
  `/policy-log-attachments`, `/trust-ledger`, `/trust-balance`, `/search`,
  `/users`, `/correspondence-templates`, `/reminder-rules`,
  `/scheduled-emails`, `/email-templates/:key`: org B's row (or its
  distinguishing value, for `/trust-balance`) is absent from the org-A response.
- **detail/update/delete** — `GET|PATCH|DELETE /{persons,clients,policies,
  vehicles,carriers}/:id`, `GET /invoices/:id`, `POST /invoices/:id/void`,
  `GET /payments/:id`, `POST /payments/:id/void`, `GET /receipts/:id`,
  `GET /policy-attachments/:id/link`, `DELETE /policy-log-attachments/:id`,
  `PATCH|DELETE /correspondence-templates/:id`,
  `PATCH|DELETE /reminder-rules/:id`, `POST /scheduled-emails/:id/cancel`,
  `PATCH|DELETE /users/:id`, `POST /users/:id/{restore,resend-welcome}`,
  `GET /policies/:policyId/activities`,
  `GET /policies/:policyId/merge-fields`: org B's id answers 404 (403 for the
  role-gated ones is also acceptable only where the route checks role before
  lookup — assert the exact status per case, and assert the row is unchanged
  afterwards for the mutating ones).
- **create-with-parent** — `POST /clients` (`namedInsuredId`),
  `POST /policies` (`clientId`, `carrierId`), `POST /vehicles` (`policyId`),
  `POST /policy-logs` (`policyId`), `POST /invoices` (`policyId`),
  `POST /payments` (`invoiceId`), `POST /policy-attachments/presign` and
  `/confirm` (`policyId`), `POST /policy-log-attachments` (`logId`,
  `attachmentId`), `POST /reminder-rules` (`templateId`),
  `POST /clients/:clientId/send-email`,
  `POST /policies/:policyId/send-correspondence`: the other org's parent id is
  rejected as missing (404/400/409 per route — assert the route's actual
  contract, and that no row was created).
- **exempt, with a written reason** — `/health`, `/vin-decode` (no org),
  `/auth/*` (`requireSession`, pre-org by design), `POST /users/invite` and
  `POST /reminders/tick` (org-scoped but no cross-org id to pass; covered by
  their own tests).

Completeness check: a test that walks the Express router stack
(`app.router.stack`, recursing into mounted routers' `handle.stack`, reading
`route.path` and `route.methods`) and asserts the registered `method path` set
equals the set in the table. A new route therefore fails this test until
someone adds an entry or an exemption with a reason. If Express 5's router
introspection turns out to be awkward, keep the same assertion shape and derive
the registered set once at module load with a clear failure message — do not
downgrade to "table is non-empty".

**8. `db/rls.test.ts` — the proof.** Fixtures in orgs A and B, then, inside
`runInOrg(orgA)`, a raw `db.execute(sql\`select id, org_id from clients where id
in (…)\`)` with no org predicate: org B's id is absent, org A's present. The
same query on `adminDb` returns both. Plus acceptance criterion 1: outside any
context, `db.execute(sql\`select count(*)::int from clients\`)` is `0` — the one
place a global count assertion is legitimate, because RLS makes it zero
regardless of what other workers are doing; add a comment saying so, since
CLAUDE.md otherwise forbids it. Repeat the count assertion across a couple of
other tenant tables (`invoices`, `policy_logs`) and add a loop over the full
table list if it stays fast.

**9. Docs.** Rewrite `docs/multitenancy.md`: keep *What was ruled out* and
*History*; convert *Data model*, *Request scoping* and *Rollout order* from a
plan-with-done-markers into a description of the built system — membership
model, session-bound org, opaque ids, the two isolation layers (repository
`orgId` + RLS), the two database roles and which code may use which, the
per-request transaction and its pool-size consequence. Keep genuinely
unfinished items (org settings, onboarding/invite flow, demo org, frontend)
clearly marked as not built. Add to `CLAUDE.md`, near the top of a new short
"Multi-tenancy" section: every repository function takes `orgId` as its first
argument; never import `adminDb` outside `db/`, `jobs/` and the seed; route
work runs inside the request's org context.

## Tests

Add: `backend/src/db/rls.test.ts`, `backend/src/routes/crossTenant.test.ts`.
Update: `backend/src/routes/testHelpers.ts` and every test that calls a
repository outside a request (the sweep in step 6).

Run, against a private database (this runner is isolated, but keep the habit):

```
docker compose exec -T db createdb -U postgres myapp_rls
cd backend
export DATABASE_ADMIN_URL=postgresql://postgres:password@localhost:5433/myapp_rls
export DATABASE_URL=postgresql://app:password@localhost:5433/myapp_rls
npm run db:push        # now also applies rls.ts
npm run db:bootstrap
npx vitest run
npm run lint && npm run typecheck && npm run format:check
```

`npm run db:push` against the shared `myapp` is off-limits, so the RLS policies
will not exist there until this merges and someone pushes — say so in the PR.

Frontend: untouched; no frontend lint/build needed beyond what CI runs.

A useful intermediate checkpoint: land steps 1–3 (context plumbing, no
policies) and confirm the suite is still green; RLS itself then only removes
rows, so anything that breaks after step 4 is a genuine scoping gap.

## Touches backend

yes

## Risks / open questions

- **The `organizations` SELECT policy breaks the org picker.**
  `meResponse` (`auth/routes.ts:31`) calls `findOrganizationById`, and
  `listActiveMembershipsWithOrg` joins `organizations` — both run under
  `requireSession`, with no org context, so a policy of
  `id = current_setting('app.org_id', true)` returns nothing and `/auth/me`
  reports `org: null` with an empty membership list. The picker stops working
  entirely. Recommended resolution: treat `organizations` the same way the
  issue treats `users`/`sessions`/`org_memberships` — reached through the auth
  layer, so **not** RLS-protected — and note the deviation in the PR. The
  alternative (keep the policy, route those two reads through `adminDb`) puts
  `adminDb` into `repositories/`, which is exactly what step 5 forbids.
  **Needs a decision before implementation**; everything else in the plan is
  unaffected either way.
- **Commit happens after the response is written.** With a request-long
  transaction, a `201` is on the wire before `COMMIT` returns. A commit failure
  (serialization, disk, connection loss) then means the client was told about a
  write that did not durably happen. Low probability and inherent to the design
  the issue specifies; the alternative — pin a pooled client per request, use
  session-level `SET app.org_id` with autocommit per statement, and destroy the
  client if `RESET` fails — preserves today's semantics exactly but gives up
  request atomicity. Recommend implementing as specified and recording the
  trade-off in `docs/multitenancy.md`.
- **Connection pinning changes pool math.** One in-flight request = one
  connection held for the request's full duration, including external I/O
  (Resend sends, R2 presign, NHTSA VIN decode, PDF generation). Concurrency
  above `max` queues. Set `DB_POOL_MAX` (default 20), document it, and check it
  against Postgres `max_connections` (100 by default) times the number of app
  containers plus the scheduler's admin pool.
- **A nested `runInOrg` around a supertest call would deadlock or read stale
  data** (fixtures uncommitted on one connection, the request on another). The
  same-org reuse branch in step 2 covers the accidental case; keep fixture
  `runInOrg` blocks fixture-only and never issue an HTTP request inside one.
- **Test-suite blast radius.** RLS is all-or-nothing: from step 4 onward every
  test that writes outside a context fails until wrapped. The sweep is
  mechanical but broad, and the work cannot land in pieces.
- **`FORCE ROW LEVEL SECURITY` assumes the owner is a superuser.** True for
  every environment in the repo today. If production's owner role ever loses
  that, bootstrap, seed and the scheduler break; mitigation is `ALTER ROLE …
  BYPASSRLS`, noted in `rls.ts`.
- **Production pre-flight:** `rls.ts` must run against production before the
  new `app`-role code paths do, and it only runs via `db:push`. Confirm the
  deploy step runs `db:push` (CI does for the test database; verify the
  production deploy path in `ci.yml` before merge).

## Out of scope

- Frontend (sub-issue 9).
- Putting `users`, `sessions` or `org_memberships` behind RLS.
- Moving the jobs off `adminDb` onto a per-org context.
- The remaining org-settings migration (`MAIL_FROM`, `MAIL_REPLY_TO`,
  `REMINDER_TIMEZONE`, `REMINDER_SEND_HOUR`), onboarding/invite flow, and the
  demo org — later items in `docs/multitenancy.md`'s rollout order.
- Any change to endpoint contracts in `docs/API.md`.
