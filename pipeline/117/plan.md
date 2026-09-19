---
issue: 117
status: pending-review
---

# Multi-tenant 2/8: organizations, memberships, org_id on every tenant table, seed

## Goal

After this change the schema knows about tenants, but nothing else in the app does:

- `organizations` and `org_memberships` tables exist, with types, relations and two new
  repository modules (`organizations.ts`, `orgMemberships.ts`) plus unit tests.
- Every tenant-owned table from the issue's list carries `org_id NOT NULL` → `organizations`
  with a **temporary column default of `1`** and a composite index led by `org_id`.
  `sessions.org_id` is nullable and unused.
- `email_templates.key` unique becomes `(org_id, key)`; `invoices.invoice_number` and
  `receipts.receipt_number` exist, NOT NULL, unique per org, auto-filled by a temporary
  default so no create path has to change.
- `db:push` against a fresh database succeeds; `db:bootstrap` creates org `1` (`default org` /
  `default-org`), an admin membership for `ADMIN_EMAIL`, and an org-1 welcome template;
  `db:seed` fills `default org` with the existing 100 clients / 300 policies and adds a small
  `second org` (5 clients, a couple of policies, two staff, memberships, welcome template).
- **Every existing test passes with no test-side edits.** No auth change, no repository
  signature change, no cross-tenant enforcement.

## Scope check

Fits PROJECT.md **Direction item 2** ("Make the app multitenant…") and covers rollout steps 1–2
of `docs/multitenancy.md` (organizations table; `org_id` on every domain table with FKs and
indexes). Depends on #116 (`db:push` + the `app`/admin role split), which is already on `main`.

Two deliberate divergences from `docs/multitenancy.md` that the plan should record in the doc,
because the doc is the reference other in-flight work reads:

1. The doc says "**One user belongs to one organization**" with `org_id` on `users`, and leaves
   multi-org membership as an **Open** question. Issue #117 answers it: a real
   `org_memberships` table, and **no `org_id` on `users`**. Update the *Data model* section of
   `docs/multitenancy.md` accordingly (and note `users.role` survives until sub-issue 3).
2. The doc describes a backfill *migration*; #116 replaced migrations with `db:push`, so the
   equivalent here is the temporary column default plus bootstrap creating org 1.

Triage labels look right: `enhancement`, `agent`, `pipeline:needs-plan`, `area:backend`. There is
no frontend work at all in this sub-issue (#8 covers that), so no `area:frontend`.

## Files / areas

Add:

- `backend/src/repositories/organizations.ts` — `findOrganizationById`, `findOrganizationBySlug`
- `backend/src/repositories/orgMemberships.ts` — `listMembershipsForUser`, `findMembership`,
  `createMembership`, `updateMembership`
- `backend/src/repositories/organizations.test.ts`
- `backend/src/repositories/orgMemberships.test.ts`
- `backend/src/db/seed/organizations.ts` — seeds org rows + memberships (see Approach step 7)

Change:

- `backend/src/db/schema.ts` — the two new tables, `sessions.orgId`, `orgId` on 21 tenant tables,
  `email_templates` unique `(org_id, key)`, `invoices.invoiceNumber`, `receipts.receiptNumber`
- `backend/src/db/relations.ts` — `organizationsRelations`, `orgMembershipsRelations`,
  `org` on `usersRelations` / `sessionsRelations`
- `backend/src/types/index.ts` — `Organization`, `NewOrganization`, `OrgMembership`,
  `NewOrgMembership`
- `backend/src/db/bootstrap.ts` — org 1 insert-if-absent, sequence fix-up, admin membership,
  welcome template scoped to org 1
- `backend/src/db/seed/run.ts`, `users.ts`, `carriers.ts`, `households.ts`, `policies.ts`,
  `wipe.ts` — org-aware seeding
- `backend/src/repositories/emailTemplates.ts` — `upsertEmailTemplate`'s `onConflict` target and
  `findEmailTemplateByKey`'s determinism (see Approach step 6); **bodies only, signatures
  unchanged**
- `backend/src/repositories/index.ts` — export the two new modules, and refresh the stale header
  comment ("none of the tables have an owner/tenant column today") to point at the rollout
- `docs/multitenancy.md` — record the membership decision above

Not touched: routes, auth/middleware, `routes/testHelpers.ts`, `db/validation.ts`, `db/roles.ts`
(its `GRANT … ON ALL TABLES` runs as part of `db:push`, so new tables are covered), frontend.

## Approach

1. **`organizations`** in `schema.ts`, above `users`:
   `id serial pk`, `name varchar(150) notNull`, `slug varchar(64) notNull.unique()`,
   `nextInvoiceNumber integer notNull default 1`, `nextReceiptNumber integer notNull default 1`,
   `createdAt`/`updatedAt` like every other table. No settings or `is_demo` columns — those are
   sub-issues 5 and 7.

2. **`org_memberships`**: `id`, `userId` → `users.id` (`onDelete: "cascade"`), `orgId` →
   `organizations.id` (`onDelete: "cascade"`), `role: userRoleEnum("role").notNull().default("staff")`,
   `isActive boolean notNull default true`, timestamps;
   `unique("org_memberships_user_id_org_id_unique").on(userId, orgId)` plus
   `index("org_memberships_org_id_idx").on(orgId)`. Comment that `users.role` is still the live
   role and the membership role mirrors it until sub-issue 3.

3. **`sessions.orgId`**: `integer("org_id").references(() => organizations.id)`, nullable, with a
   comment that nothing reads it until sub-issue 3.

4. **`org_id` on the 21 tenant tables**. One shared shape, written out per table (Drizzle has no
   column-spread that keeps types clean across `pgTable` calls, and the repo writes columns out
   longhand everywhere):

   ```ts
   // Temporary default 1: existing inserts don't supply org_id yet. Removed in
   // sub-issue 6 once every insert passes one explicitly.
   orgId: integer("org_id")
     .notNull()
     .default(1)
     .references(() => organizations.id),
   ```

   Tables: `persons`, `drivers`, `clients`, `client_phones`, `client_emails`, `carriers`,
   `auto_policies`, `vehicles`, `policy_drivers`, `policy_logs`, `policy_attachments`,
   `policy_log_attachments`, `invoices`, `invoice_items`, `payments`, `receipts`, `trust_ledger`,
   `email_templates`, `email_log`, `reminder_rules`, `scheduled_emails`.
   Each gets `index("<table>_org_id_idx").on(table.orgId)` — for tables whose hot lookup is a
   single FK, make it the composite the issue asks for and lead with `org_id`
   (e.g. `index("auto_policies_org_client_idx").on(table.orgId, table.clientId)`), keeping the
   existing single-column indexes in place; sub-issue 4 will prune whichever become redundant.
   `organizations` is declared before `users` so the `references()` closures resolve without
   forward-reference gymnastics.

5. **Per-org uniques.** `emailTemplates.key` drops `.unique()` and gains
   `unique("email_templates_org_id_key_unique").on(table.orgId, table.key)` in the table's extras
   callback (the table currently has no extras callback — add one).

6. **Email-template call sites** (required, or `db:push` succeeds and runtime breaks):
   - `upsertEmailTemplate`'s `onConflictDoUpdate({ target: emailTemplates.key })` must become
     `target: [emailTemplates.orgId, emailTemplates.key]`; Postgres errors with "no unique or
     exclusion constraint matching the ON CONFLICT specification" otherwise.
   - Same for `bootstrap.ts`'s `onConflictDoNothing({ target: emailTemplates.key })`.
   - `findEmailTemplateByKey(key)` takes the first row for a key. Once the seed inserts a welcome
     template per org, that becomes non-deterministic on a seeded dev database. Keep the
     signature and add `.orderBy(emailTemplates.orgId).limit(1)` with a comment that sub-issue 4
     replaces this with an explicit `orgId` argument. Same treatment for the
     `update(...).where(eq(emailTemplates.key, "welcome"))` reclassify line in `bootstrap.ts`
     (scope it to org 1).

7. **`invoice_number` / `receipt_number`.** A constant default can't satisfy a unique constraint,
   so use an identity column, which fills every insert automatically and still accepts an
   explicit value when sub-issue 5 starts allocating from the org counters:

   ```ts
   // Temporary: auto-allocated globally so existing create paths keep working.
   // Sub-issue 5 allocates from organizations.next_invoice_number inside the
   // creating transaction and drops the identity.
   invoiceNumber: integer("invoice_number").notNull().generatedByDefaultAsIdentity(),
   ```

   plus `unique("invoices_org_id_invoice_number_unique").on(table.orgId, table.invoiceNumber)`;
   mirror for `receipts.receiptNumber`. If `drizzle-kit push` (0.31) misbehaves on the identity
   column, the fallback is an explicit `pgSequence` + `.default(sql\`nextval('…')\`)`; decide by
   running the push, not by guessing. Do **not** change the "id doubles as the sequential number"
   comments to past tense yet — id is still what the PDFs print until sub-issue 5.

8. **Types** in `src/types/index.ts`: import `organizations` / `orgMemberships` and add
   `Organization`, `OrgMembership`, `NewOrganization`, `NewOrgMembership` in the existing
   alphabetical-ish grouping. Leave `declare global { … Request { user?: User } }` alone.

9. **Relations** in `relations.ts`: `organizationsRelations` (`memberships: many`,
   `sessions: many`), `orgMembershipsRelations` (`user: one(users)`, `org: one(organizations)`),
   add `memberships: many(orgMemberships)` to `usersRelations` and `org: one(organizations)` to
   `sessionsRelations`. Don't add an `org` relation to all 21 tenant tables — nothing queries it
   and it's churn; sub-issue 4 can add the ones it needs.

10. **Repositories**, mirroring `repositories/users.ts` exactly (plain `db` from `../db`, no
    transaction wrapper, `returning()` on writes, `updatedAt: new Date()` on update):

    ```ts
    findOrganizationById(id: number): Promise<Organization | undefined>
    findOrganizationBySlug(slug: string): Promise<Organization | undefined>

    listMembershipsForUser(userId: number): Promise<OrgMembership[]>      // orderBy orgId
    findMembership(userId: number, orgId: number): Promise<OrgMembership | undefined>
    createMembership(input: NewOrgMembership): Promise<OrgMembership>
    updateMembership(id: number, input: Partial<NewOrgMembership>): Promise<OrgMembership | undefined>
    ```

    Export both from `repositories/index.ts`.

11. **`bootstrap.ts`** (runs on `adminDb`, insert-if-absent, must stay idempotent — CLAUDE.md
    allows running it against the shared database):
    - `insert(organizations).values({ id: 1, name: "default org", slug: "default-org" })
      .onConflictDoNothing({ target: organizations.id })`, then
      `SELECT setval('organizations_id_seq', GREATEST((SELECT max(id) FROM organizations), 1), true)`
      — otherwise the serial still sits at 0 and the next `insert` without an explicit id
      collides on id 1.
    - After the `ADMIN_EMAIL` user upsert, read the row back and
      `createMembership`-equivalent insert with `onConflictDoNothing` on `(user_id, org_id)`,
      role `admin`. Do the same for the automation user with role `staff` (it authors policy logs
      and will need a membership once sub-issue 3 lands; cheap to add now).
    - Welcome template insert gains `orgId: 1` and the composite conflict target from step 6.
    - Order matters: organization first, users second, memberships third.

12. **Seed.** Keep `seed()`'s shape; thread an explicit `orgId` through the seed modules rather
    than relying on the column default:
    - New `src/db/seed/organizations.ts`: `seedOrganizations()` inserts `{id: 1, name: "default
      org", slug: "default-org"}` and `{id: 2, name: "second org", slug: "second-org"}` with
      explicit ids, then `setval` as in step 11.
    - `seedUsers(orgId, { staffCount, adminIsMember })`, `seedCarriers(orgId, count)`,
      `seedHouseholds(count, orgId)` — these insert through `db.insert(...)` directly, so adding
      `orgId` to the values is mechanical. `seedUsers` also inserts an `org_memberships` row per
      user whose `role` mirrors `users.role`; `ADMIN_EMAIL` gets an admin membership in **both**
      orgs but only one `users` row (guard the second call against re-inserting the email).
    - `seedPolicies` / `seedFinancials` go through the **repositories**
      (`createAutoPolicyWithDetails`, `createInvoiceWithDetails`, `recordPayment`,
      `createPolicyLog`), which take no `orgId` in this sub-issue, so their rows land in org 1 via
      the column default. For `second org`, collect the ids the helpers return and follow with an
      `update … set org_id = 2` fix-up over the affected tables (`auto_policies`, `vehicles`,
      `policy_drivers`, `policy_logs`), in a small, clearly-commented
      `reassignPoliciesToOrg(orgId, policyIds)` helper marked as temporary until sub-issue 4
      threads `orgId` through those repositories. Keep `second org` to the issue's "a couple of
      policies" and **no financials**, so the fix-up stays tiny.
    - `auto_policies.policy_number` is still globally unique and `seedPolicies` numbers
      `POL-000001…`; give `seedPolicies` a `prefix`/start-sequence parameter so `second org`
      doesn't collide (e.g. `POL2-000001`).
    - `carriers.naic` is also still globally unique; `seedCarriers` already retries random NAICs
      within a call — track the used set across both calls (pass it in, or seed the second org's
      carriers from the same generator) so the two calls can't collide.
    - Welcome template inserted for each org.
    - `run.ts`: seed orgs → per-org users/carriers/households/policies/financials → add
      `organizations` and `org_memberships` to the printed row-count table.
    - `wipe.ts`: delete `org_memberships` before `users` (the FK cascades, but be explicit and
      keep the FK-safe order readable), and delete `organizations` **last**, after all tenant
      rows. `email_templates` is currently left untouched by `wipe` "so admin edits survive" —
      but its rows now hold an `org_id` FK to a row `wipe` deletes, so it must now be wiped too
      (or the org delete fails). Delete only the seed-owned welcome rows if you want to preserve
      that intent; simplest is to delete all `email_templates` and re-insert per org, and say so
      in the module comment.

13. **Verify locally** per CLAUDE.md, on your own database — never the shared one:
    `createdb myapp_<agent>`, export `DATABASE_ADMIN_URL`/`DATABASE_URL`, `npm run db:push`,
    `npm run db:bootstrap`, `npm run db:seed`, `npx vitest run`, then `dropdb`.

## Tests

- **New**: `repositories/organizations.test.ts` and `repositories/orgMemberships.test.ts`,
  following `repositories/sessions.test.ts` — a unique per-file prefix (`orgs-repo-test-`,
  `org-memberships-repo-test-`) baked into slug/email, and an `afterEach` that deletes only rows
  with that prefix (deleting the org cascades its memberships; deleting the user does too). No
  truncation, no global row-count assertions.
  - organizations: create a row directly via `db.insert`, then `findOrganizationById` /
    `findOrganizationBySlug` hit and miss; assert `nextInvoiceNumber`/`nextReceiptNumber`
    default to 1.
  - orgMemberships: `createMembership` then `findMembership(userId, orgId)`;
    `listMembershipsForUser` returns both of a user's two orgs and excludes another user's;
    `updateMembership` flips `role`/`isActive` and bumps `updatedAt`; a duplicate
    `(userId, orgId)` insert rejects.
- **Regression**: the whole existing suite must pass untouched — that is the acceptance criterion
  for the defaults. `npx vitest run` on your own database.
- `npm run typecheck`, `npm run lint`, `npm run format:check` (the repo commits Prettier-clean).
- No frontend change, so no frontend lint/build needed.

## Touches backend

yes

## Risks / open questions

- **Existing databases (production and the shared dev db) will fail `db:push`.** Adding
  `org_id NOT NULL DEFAULT 1` with an FK to a table that has rows requires organization 1 to
  already exist, and `bootstrap.ts` — which creates it — runs *after* push in the Dockerfile CMD
  and in `ci.yml`. A fresh database is fine (no rows to validate), which is all the issue's
  acceptance covers, but the production deploy needs either a one-time
  `INSERT INTO organizations (id, name, slug) VALUES (1, 'default org', 'default-org')` between
  two pushes, or a pre-push step. **Recommend flagging this to the maintainer in the PR body and
  deciding there**; don't invent a deploy-workflow change inside a schema sub-issue.
- `generatedByDefaultAsIdentity()` support in `drizzle-kit push` 0.31 should be confirmed by
  actually running the push on a scratch database before committing to it; fallback is an
  explicit sequence (step 7).
- `db/validation.ts` builds `createInsertSchema` from most of these tables. Columns with a
  default become optional in drizzle-zod, so route payload validation should be unaffected —
  confirm via `npm run typecheck` plus the route test suite rather than by inspection.
- `findEmailTemplateByKey` becoming ambiguous across orgs (step 6) is the one place where the
  "nothing changes behaviorally" promise is thin. The `orderBy` keeps it deterministic; it is
  genuinely resolved in sub-issue 4.
- Other still-global uniques this sub-issue deliberately leaves alone: `auto_policies.policy_number`,
  `carriers.naic`, `users.email`, `reminder_rules (trigger, offset_days)`,
  `policy_attachments.storage_key`. `reminder_rules` in particular becomes wrong once two orgs
  configure the same "30 days before expiration" rule — worth confirming whether it belongs in
  #117 or in a later sub-issue; the issue text names only `email_templates.key`, so this plan
  follows the issue.
- The `second org` fix-up (`update … set org_id = 2` after repository-created rows) is
  intentionally temporary. If it reads as too hacky in review, the alternative is inserting the
  second org's two policies with direct `db.insert` calls instead of through
  `createAutoPolicyWithDetails`.

## Out of scope

Auth and session binding, `requireAuth` attaching an org, and removing `users.role` (#3);
threading `orgId` through repositories and routes and giving `TestContext` its own org (#4–#6);
dropping the temporary column defaults and the identity columns, and allocating invoice/receipt
numbers from the org counters (#5–#6); org settings columns replacing env vars (#5); RLS and
`SET LOCAL app.org_id` (#7); any frontend work, org creation/invite flow, and the demo org (#8).
