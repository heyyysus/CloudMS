---
issue: 130
status: pending-review
---
# Opaque 22-char base64url row ids on every table

## Goal

Every primary key and every foreign key in `backend/src/db/schema.ts` is
`varchar(22)` holding 128 bits of randomness rendered as base64url
(`^[A-Za-z0-9_-]{22}$`). No `serial` remains. Concretely, done means:

- A new `backend/src/db/ids.ts` supplies the id primitives: `generateRowId()`
  (Node `randomBytes(16).toString("base64url")`), the validation pattern, the
  SQL default expression, and the two Drizzle column helpers every table uses.
- Every id column carries **both** a Postgres `DEFAULT` (pgcrypto
  `translate(encode(gen_random_bytes(16),'base64'),'+/=','-_')` — the 3-char
  `from` set both maps `+/` and deletes the padding `=`) and a Drizzle
  `$defaultFn`, so no write path can produce a row without an id and the value
  exists before `.returning()`.
- The 21 tenant tables' `org_id .notNull().default(1)` becomes plain nullable
  `varchar(22)` with the FK kept; #121 restores `NOT NULL`. No backfill, no
  bridging.
- Nothing orders by `id` as a creation-time proxy any more (6 sites, listed
  below).
- `bootstrap.ts` dedupes on `organizations.slug`, reads the org id back, and
  has no `setval` and no `DEFAULT_ORG_ID`; repeated `npm run db:bootstrap`
  runs stay no-ops.
- Every `:id` route param that fails the 22-char pattern answers **404**, not
  400 — matching #119 rule 1's cross-org decision.
- Frontend id/FK types are `string`; `client-tabs-storage.ts` self-purges
  stale integer tabs by flipping its `typeof … === 'number'` guard.
- Backend vitest suite, `lint`, `format:check`, `typecheck`, `build` green;
  frontend `lint` + `build` green.

The issue is specified tightly enough to implement as written. The three
places where it leaves a real decision open are in *Risks / open questions*,
and the plan states the assumption it proceeds under for each.

## Scope check

PROJECT.md direction item 2 ("make the app multitenant") and
`docs/multitenancy.md` rollout step 3. This is sub-issue 4/9 of #115 and runs
before #119 so repositories, tests and the frontend are rewritten once. It is
a prerequisite for the org-scoping work, not a detour: `docs/multitenancy.md`
already argues tenant enforcement lives in repository `orgId` filters plus
#122's RLS backstop, and this issue only removes the sequence-shaped
information leak that would survive all of that.

Triage labels look right: `enhancement`, `area:backend`, `area:frontend` all
apply (the frontend half — 61 FK fields in `src/api/*.ts`, plus story
fixtures — is not optional, since `tsc -b` gates `npm run build`). Worth
noting for the reviewer: the label set does not signal that this is a
**breaking schema change with no migration path** — `drizzle-kit push` cannot
convert `serial` → `varchar(22)` on a database with rows. See Risks.

## Files / areas

**New**
- `backend/src/db/ids.ts` — `generateRowId()`, `ROW_ID_LENGTH`,
  `ROW_ID_PATTERN`, `ROW_ID_DEFAULT_SQL`, and column helpers `rowIdPk()` /
  `rowIdFk(name)`.
- `backend/src/db/ids.test.ts` — unit tests for the generator and pattern.
- `backend/src/db/extensions.ts` — `CREATE EXTENSION IF NOT EXISTS pgcrypto`
  (and `pg_trgm`, see Approach step 2), run on `adminDb` before push.

**Schema / data layer**
- `backend/src/db/schema.ts` — all 27 tables (23 tenant + `organizations`,
  `users`, `sessions`, `org_memberships`; `email_templates` is one of the 23).
  Also `policy_attachments.source_id` and `trust_ledger.reversal_of_id`, which
  are ids without a declared FK. Columns that stay `integer`:
  `next_invoice_number`, `next_receipt_number`, `invoice_number`,
  `receipt_number`, `log_number`, `offset_days`, `attempts`, `size_bytes`,
  `year`. Also update the stale sub-issue ordinals in the `org_id` and
  invoice/receipt-number comments (they say "sub-issue 6"/"sub-issue 5",
  which after the renumbering are #121 and #120) — reference issue numbers.
- `backend/src/db/bootstrap.ts` (lines 7, 16-23, 56, 65, 72, 88).
- `backend/src/db/seed/organizations.ts` (explicit ids + `setval` +
  `DEFAULT_ORG_ID`/`SECOND_ORG_ID` constants all go; `run.ts:65` already
  reads the rows back from `.returning()`), plus the `orgId: number`
  parameters threaded through `seed/users.ts`, `carriers.ts`,
  `households.ts`, `policies.ts`, `financials.ts`, `run.ts`.
- `backend/src/db/validation.ts` — no edit needed (drizzle-zod derives from
  the schema), but re-check the derived insert schemas still typecheck.
- `backend/src/db/roles.ts` — no edit: the sequence grants still matter for
  the `invoice_number`/`receipt_number` identity columns.
- `backend/src/types/index.ts:119` — `orgId?: number` → `string` on the
  Express request augmentation.
- `backend/package.json` (`db:push` script) and `backend/Dockerfile:35` (the
  CMD runs `npx drizzle-kit push --force` directly, so it needs the
  extensions step too). `.github/workflows/ci.yml` needs no change because it
  calls `npm run db:push`.

**Repositories** (~140 `: number` id signatures) — every file under
`backend/src/repositories/`. The ordering fixes are the non-mechanical part:
- `invoices.ts:52,60`, `receipts.ts:18,26`, `payments.ts:295,303`,
  `trustLedger.ts:12,20` — `desc(id)` → `desc(createdAt), desc(id)`.
- `scheduledEmails.ts:73` — `asc(scheduledFor), desc(id)` → add
  `desc(createdAt)` before the id tiebreaker.
- `orgMemberships.ts:111` — `.orderBy(users.id)` → `users.email` (a stable,
  meaningful order for a member list) or `users.createdAt, users.id`.

**Routes**
- `backend/src/routes/helpers.ts:7` — `parseId` returns `string | undefined`
  and writes **404** `{ error: "Not found" }` on a pattern miss.
- `backend/src/routes/schemas.ts:32` — `idParam` becomes
  `z.string().regex(ROW_ID_PATTERN)`; the body/query id fields at lines 110,
  184, 192, 199, 216, 217, 270, 300, 306, 335, 355, 380, 390 follow.
- The 12 `:id` routers plus the nested-param callers:
  `clients.ts`, `policies.ts`, `vehicles.ts`, `carriers.ts`, `persons.ts`,
  `invoices.ts`, `payments.ts`, `receipts.ts`, `policyLogs.ts`,
  `policyLogAttachments.ts`, `policyAttachments.ts`,
  `correspondenceTemplates.ts`, `reminderRules.ts`, `users.ts`,
  `trustLedger.ts`, `mail.ts`, `policyActivities.ts`, `accountingDocuments.ts`,
  `search.ts`, `emailTemplates.ts`.
- `backend/src/accountingDocuments.ts:24` — `formatDocumentNumber(id: string)`
  returns `#${id}` (padding a 22-char uid is meaningless); its callers at
  95, 96, 114, 142 and `routes/accountingDocuments.ts:69,104` (PDF filenames)
  are unchanged in shape. base64url's `-`/`_` are filename- and
  Content-Disposition-safe.
- `backend/src/routes/policyActivities.ts:31` — `scheduled-email:${row.id}`
  keeps working as-is (string interpolation).
- `backend/src/auth/*`, `backend/src/jobs/*` (`planner.ts`, `dispatcher.ts`,
  `automationUser.ts`), `backend/src/accountingLogs.ts`,
  `backend/src/emails.ts`, `backend/src/storage/r2.ts`
  (`attachmentKeyPrefix(policyId)`) — numeric id parameters → `string`.

**Backend tests** — `backend/src/routes/testHelpers.ts` (the eight
`private …Ids: number[]` arrays, `makeSessionCookie(userId, orgId)`, and
every fixture method's `Partial<New…>` overrides), plus the 33 `*.test.ts`
files: 36 literal nonexistent ids (`99999`-style) become a shared
`MISSING_ROW_ID` constant.

**Frontend**
- `frontend/src/api/*.ts` (19 files) — all `id`/`*Id` fields → `string`.
- `frontend/src/lib/client-tabs-storage.ts` — `ClientTab.id: string`, guard to
  `typeof … === 'string'`, `removeTabById(…, id: string)`. No key bump.
- `frontend/src/pages/ClientDetail.tsx:38` — `Number(params.clientId)` becomes
  the raw string (validate with the same 22-char pattern rather than `isNaN`).
- `frontend/src/components/clients/policy-tabs.tsx:33`
  (`onSelect(Number(value))`), `policy-activities.tsx:26`
  (`Number(activity.id.split(':')[1])`), `add-policy-dialog.tsx:186,389`
  (`personId: z.number()`, `carrierId: Number(...)`),
  `send-correspondence-dialog.tsx:188`, `admin/reminder-rule-form.tsx:27,102`
  (`templateId: z.number().int().positive()` → the string pattern) — Radix
  `Select` values are already strings, so these conversions simply disappear.
- `frontend/src/components/clients/invoice-receipt-dialog.tsx:150,162` —
  renders the full 22-char uid; check the layout doesn't overflow at that
  width (a `break-all`/truncating class may be needed *visually* only, the
  value itself is not truncated).
- Story fixtures: 212 numeric id literals across 40 files (37 of them
  `*.stories.tsx`) → 22-char strings.

**Docs**
- `docs/API.md` — a "Row ids" bullet in **Conventions** (format + that a
  malformed `:id` is 404, not 400, and why), the `personId: number` shape at
  :260, and the "integers" aside at :419.
- `docs/multitenancy.md` — a short *Row ids* subsection under **Data model**
  (format, dual generation, why flat random beat a composite `<org>-<seq>`
  key, and that `org_id` is nullable until #121), and a line in **Rollout
  order** recording this as the step before repository scoping.
- No `PROJECT.md` change: it does not describe id types.

## Approach

1. **Id primitives.** `backend/src/db/ids.ts`:
   `generateRowId()` = `randomBytes(16).toString("base64url")` (Node's
   `base64url` is unpadded, so 16 bytes → exactly 22 chars);
   `ROW_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/`;
   `ROW_ID_DEFAULT_SQL = sql\`translate(encode(gen_random_bytes(16), 'base64'), '+/=', '-_')\``
   (24 output chars, so `encode` inserts no newline);
   `rowIdPk = () => varchar("id", { length: 22 }).primaryKey().$defaultFn(generateRowId).default(ROW_ID_DEFAULT_SQL)`
   and `rowIdFk = (name: string) => varchar(name, { length: 22 })`.
   **Verify first** that drizzle-orm accepts `.default()` and `$defaultFn()`
   on the same builder and that `drizzle-kit push` emits the SQL `DEFAULT`
   (they write different fields on the column builder, so they should
   coexist). If it rejects one, keep `$defaultFn` in the schema and apply the
   SQL defaults from the extensions/post-push script instead — same
   belt-and-braces outcome, spelled differently.
2. **pgcrypto must exist before push.** `gen_random_bytes` is pgcrypto (only
   `gen_random_uuid` is built in), and Postgres resolves a `DEFAULT`
   expression at DDL time, so `drizzle-kit push` fails on a database without
   it. Add `backend/src/db/extensions.ts` running on `adminDb` and wire it
   ahead of push in both `package.json`'s `db:push` and the Dockerfile CMD.
   Create `pg_trgm` in the same script: the schema's `gin_trgm_ops` indexes
   already need it and today it is an undocumented manual step
   (`pipeline/118/notes.md:150` records a runner hitting exactly this), so one
   script closes both. If pgcrypto turns out to be unavailable in some
   environment, the fallback default expression needs no extension:
   `translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/=', '-_')`.
3. **Schema sweep.** Replace every `serial("id").primaryKey()` with
   `rowIdPk()` and every id-bearing `integer(...)` with `rowIdFk(...)`,
   keeping `.references()`, `.notNull()`, `.unique()`, `onDelete` and every
   index/unique constraint exactly as they are. On the 21 tenant tables drop
   `.notNull().default(1)` from `org_id` and leave the FK; rewrite the
   repeated comment to say the column is nullable until #121. Leave the
   integer columns listed above alone.
4. **Push to an isolated database and let the compiler drive.** Per CLAUDE.md,
   `db:push` only ever runs against this runner's own database. Then
   `npm run typecheck` and fix outward: `types/index.ts` → repositories →
   routes → jobs/auth → tests. This is mechanical `number` → `string`; the
   only judgment calls are steps 5-7.
5. **Ordering.** Apply the six fixes above. Note that `createdAt` defaults to
   `now()`, which is *transaction* time, so rows a single action writes
   (`recordPayment` writes payment + receipt + trust-ledger entries in one
   `db.transaction`) share a timestamp exactly; `createdAt DESC, id DESC` is
   then stable but arbitrary *within* that group. That is acceptable — those
   rows are one posting, not a history — but tests must not assert an order
   among same-transaction rows. See Risks for the `clock_timestamp()` option
   deliberately left out.
6. **Bootstrap.** Insert `{ name: "default org", slug: "default-org" }` with
   `onConflictDoNothing({ target: organizations.slug })`, then — because
   `onConflictDoNothing().returning()` yields `[]` on the conflict path —
   `select({ id }).from(organizations).where(eq(organizations.slug, "default-org"))`
   and use that id for the two `orgMemberships` inserts and the welcome
   template insert/reclassify (lines 56, 65, 72, 88). Delete the `setval`
   block and `DEFAULT_ORG_ID`. Same treatment in `seed/organizations.ts`,
   which already returns its rows to `run.ts`.
7. **Route params.** `parseId` validates against `ROW_ID_PATTERN` and answers
   404. Keep 400 for *body* validation (`logId`, `attachmentIds`,
   `templateId`, `personId`, …) and for the list-filter **query** params
   (`?clientId=`, `?policyId=` in `payments.ts`, `invoices.ts`,
   `trustLedger.ts`, `vehicles.ts`, `policyLogs.ts`,
   `policyLogAttachments.ts`, `policyAttachments.ts`, `policies.ts`): those
   return a *list*, so an unknown id yields `[]` rather than a
   presence-revealing 404, and the issue's 404 rule is specifically about
   row-level `:id` lookups. Flagged as an open question in case the reviewer
   wants those unified too.
8. **Document display.** `formatDocumentNumber` takes a string and returns
   `#${id}`; update `accountingDocuments.test.ts`'s padding tests to assert
   the uid is rendered whole. #120 later points invoice/receipt documents at
   the per-org counters.
9. **Frontend.** Change the `api/*.ts` types first and let `tsc -b` enumerate
   the call sites; drop the now-pointless `Number(...)` conversions, flip the
   `client-tabs-storage` guard, and rewrite story fixture ids. TanStack Query
   keys and route params need no structural change — they just carry strings.
10. **Docs**, as listed above.

## Tests

Backend (vitest + `TestContext`; run `npx vitest run` against this runner's
own database after `db:push` + `db:bootstrap`):

1. `ids.test.ts` — `generateRowId()` is 22 chars, matches `ROW_ID_PATTERN`,
   and 10k draws are distinct (charset/entropy smoke test, not a collision
   proof).
2. **DB default, no id supplied** — a test that inserts through raw SQL as the
   app role (`db.execute(sql\`INSERT INTO carriers (name, naic) VALUES (…)\`
   … RETURNING id`)) and asserts the returned id matches the pattern. This is
   the acceptance criterion "an insert through any path produces a valid id",
   and it is the one the `$defaultFn` cannot cover. Clean up the row in the
   same test (no truncation, per CLAUDE.md).
3. **`$defaultFn`** — an existing repository create (e.g. `ctx.carrier()`)
   asserting `.returning()` already carries a pattern-matching id.
4. **Route params** — for at least three routers (`clients`, `invoices`,
   `users`): `GET /clients/not-a-uid` → 404, and `GET /clients/<valid-format
   but absent uid>` → 404, i.e. the two are indistinguishable. Add a case
   asserting no route answers 400 for a malformed `:id`.
5. **Ordering** — for `invoices`, `payments`, `receipts` and the trust ledger:
   create rows in *separate* awaits (distinct transactions, hence distinct
   `createdAt`) and assert newest-first. This is the regression test for the
   silent-shuffle failure mode; it must not assert an order among rows one
   action wrote together.
6. **Bootstrap idempotency** — run `npm run db:bootstrap` twice against the
   runner's own database and assert exactly one `default-org` row, one
   membership per user, one welcome template. A vitest case can assert the
   "exactly one row with slug `default-org`" invariant; the double-run itself
   is a command in the implementation notes.
7. Existing suite green: 33 files / ~423 tests, all of which change shape
   mechanically via `TestContext`.

Frontend: `npm run lint` and `npm run build` (the `tsc -b` in `build` is what
actually catches a missed `number`). Also run `npm run test` (Storybook in
Vitest browser mode) locally if Chromium is available on the runner — it is
not wired into CI, but the issue's acceptance criteria name it, and the story
fixtures are exactly what this change rewrites. If it cannot run, say so
explicitly in the notes rather than claiming it passed.

Gate: `typecheck`, `lint`, `format:check`, `test`, `build` in `backend/`;
`lint`, `build` in `frontend/`.

## Touches backend

yes

## Risks / open questions

1. **No migration path for existing data — needs an answer before deploy.**
   #116 replaced migrations with `drizzle-kit push`, and push cannot convert
   `serial` → `varchar(22)` across ~60 FK constraints on a database that has
   rows; it will either fail or take the destructive route. CI and this
   runner use fresh databases, so the pipeline gate is unaffected, but
   `docs/multitenancy.md` says production holds one live agency. **Assumption
   this plan proceeds under:** production data is not required to survive, or
   is handled separately as a deployment task. If it must survive, that is a
   hand-written SQL migration (add uid columns, backfill, repoint FKs, swap)
   which is a separate piece of work — flagging rather than silently
   assuming. The shared dev database in CLAUDE.md is in the same position:
   the first `db:push` after this merges effectively resets it.
2. **`.default()` + `$defaultFn()` coexistence in Drizzle** — verified in
   step 1 before the sweep; fallback is applying SQL defaults post-push.
3. **pgcrypto availability** — the plain `postgres:18.4` image in CI and
   Compose has it available but not created, hence step 2. Fallback
   expression needs no extension.
4. **Intra-transaction ordering is arbitrary.** `createdAt` is `now()`
   (transaction time), so the payment/receipt/ledger rows one action writes
   tie. Making them individually ordered would mean `clock_timestamp()`
   defaults or an explicit sequence column — deliberately out of scope here;
   named so the reviewer can object.
5. **404 on malformed list-filter query params** — this plan keeps 400 there
   (step 7). Cheap to unify if the reviewer disagrees.
6. **Nullable `org_id` widens types.** `New…` insert types now accept
   `orgId?: string | null`, and reads like `req.orgId!` (`routes/users.ts`,
   9 sites) stay non-null because `requireAuth` guarantees it. Nothing today
   reads `row.orgId` off a *domain* row, so nullable rows should not ripple —
   confirm during typecheck.
7. **Size** — ~280 numeric id signatures backend-side plus 212 frontend
   fixture literals. Large but mechanical; the compiler enumerates every
   site, which is the reason this issue runs before #119.
8. `varchar(22)` keys are wider than `int4` in every index and FK. Irrelevant
   at this scale; noted so it isn't re-litigated later.

## Out of scope

Org-scoping repositories and routes (#119), per-org invoice/receipt numbering
(#120), restoring `org_id NOT NULL` (#121), RLS (#122), the frontend org
picker (#123). No backfill or bridging logic for the dropped `org_id`
default. No human-readable/short display number for invoices or receipts —
ids display as the full uid. No change to the cross-org 404 rule or to the
org-level 403 (`ORG_REQUIRED`). Re-planning `pipeline/119/plan.md`, which
assumes integer ids, happens after this merges and is #119's own work.
