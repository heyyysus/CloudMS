---
issue: 120
status: pending-review
---
# Org-scope logs, attachments and accounting; per-org invoice/receipt numbers

## Goal

Every repository and route in the second half of the domain — policy logs,
policy attachments, log↔attachment links, invoices, payments, receipts, the
trust ledger, and the accounting-document/PDF helpers — takes an explicit
`orgId` first parameter, filters every read by it, sets `org_id` on every
insert, and answers a row from another organization exactly as a missing row
(404). No function in `repositories/policyLogs.ts`,
`repositories/policyAttachments.ts`, `repositories/policyLogAttachments.ts`,
`repositories/invoices.ts`, `repositories/payments.ts`,
`repositories/receipts.ts` or `repositories/trustLedger.ts` can be called
without an `orgId` — the compiler enforces it, as in #119.

On top of that, `invoices.invoice_number` and `receipts.receipt_number` stop
being globally-allocated identity columns and are allocated per organization
inside the creating transaction from `organizations.next_invoice_number` /
`next_receipt_number`, so two organizations each count 1, 2, 3 independently
and a rolled-back create does not burn a number. Every document that prints an
invoice or receipt *number* (the PDFs in `accountingDocuments.ts` and the
automatic log entries in `accountingLogs.ts`) prints the new per-org number
instead of the opaque row id; API responses carry `invoiceNumber` /
`receiptNumber` alongside `id`. Row `id` stays the 22-char uid and remains what
URLs and query keys use.

Done means: backend suite green, including a wrong-org case per route file and
the numbering cases; `docs/API.md` and `docs/multitenancy.md` updated.

## Scope check

This is roadmap item 2 in `PROJECT.md` ("Make the app multitenant …
organization-scoped repositories, per-organization invoice and receipt
numbering"), and rollout steps 4 (second part) and 5 in `docs/multitenancy.md`.
It is the direct continuation of #119, which did the first half (people,
clients, carriers, policies, vehicles, search) and established the patterns this
plan reuses: `orgId` as the first parameter, `CrossOrgReferenceError` for a
parent FK in another org, and `ctx.org()` fixtures in tests.

Triage labels look right: `enhancement`, `area:backend`, `pipeline:needs-plan`.
The change is backend-only — the frontend keeps addressing rows by uid and
displaying it, and switching the invoice/payment dialogs to show the number is
explicitly sub-issue 9's call.

## Files / areas

**Schema**

- `backend/src/db/schema.ts` — drop `.generatedByDefaultAsIdentity()` from
  `invoices.invoiceNumber` (line ~682) and `receipts.receiptNumber` (line ~787),
  leaving plain `integer(...).notNull()`; rewrite the "Temporary: auto-allocated
  globally" comments to say the number is allocated from the organization
  counter. The `invoices_org_id_invoice_number_unique` /
  `receipts_org_id_receipt_number_unique` uniques and the `org_id` indexes
  already exist and stay.

**Repositories** (all get `orgId` as first parameter)

- `backend/src/repositories/organizations.ts` — new
  `allocateInvoiceNumberInTx(tx, orgId)` and `allocateReceiptNumberInTx(tx, orgId)`.
- `backend/src/repositories/policyLogs.ts` — `listPolicyLogsByPolicyId`,
  `insertPolicyLogInTx`, `createPolicyLog`.
- `backend/src/repositories/policyAttachments.ts` — `attachmentKeyPrefix`,
  `listPolicyAttachmentsByPolicyId`, `findPolicyAttachmentById`,
  `countAttachmentsCreatedTodayByUser`, `createPolicyAttachment`,
  `storeGeneratedPolicyAttachment`, `markAttachmentsVoidedBySource`.
- `backend/src/repositories/policyLogAttachments.ts` —
  `listPolicyLogAttachmentsByPolicyId`, `linkAttachmentsToLog`,
  `unlinkPolicyLogAttachment`.
- `backend/src/repositories/invoices.ts` — `getInvoiceWithDetails`,
  `listInvoicesByPolicyId`, `listInvoicesByClientId`,
  `createInvoiceWithDetails`, `voidInvoice`.
- `backend/src/repositories/payments.ts` — `recordPayment`, `voidPayment`,
  `getPaymentWithDetails`, `listPaymentsByPolicyId`, `listPaymentsByClientId`,
  plus the private `postSweepAndFeeEntries` / `reverseSweepAndFeeEntries`.
- `backend/src/repositories/receipts.ts`, `backend/src/repositories/trustLedger.ts`
  — every exported function.
- `backend/src/repositories/index.ts` — update the header comment (it currently
  says logs/attachments/accounting land in sub-issues 6–7).

**Routes**

- `backend/src/routes/policyLogs.ts`, `policyActivities.ts`,
  `policyAttachments.ts`, `policyLogAttachments.ts`, `invoices.ts`,
  `payments.ts`, `receipts.ts`, `trustLedger.ts`,
  `routes/accountingDocuments.ts` — pass `req.orgId!` through.

**Document rendering**

- `backend/src/accountingDocuments.ts` — `formatDocumentNumber` takes the
  number; the title/row/receipt-suffix call sites use
  `invoice.invoiceNumber` / `receipt.receiptNumber`; `AccountingDocumentMeta.receipt`
  grows `receiptNumber`.
- `backend/src/accountingLogs.ts` — `invoiceCreatedLogBody`,
  `invoiceVoidedLogBody`, `paymentRecordedLogBody`, `paymentVoidedLogBody` take
  `invoiceNumber` (and, for the receipt-bearing paths, `receiptNumber`) instead
  of `invoiceId`.
- `backend/src/invoiceLabels.ts` — read-only check; it holds enum labels and
  `formatUsd` only and is expected to need **no change**.
- `backend/src/policyChangeSummary.ts` — same: a pure PDF builder over
  `PolicyDetail` with no number and no DB access, so no change expected; its
  caller `routes/policies.ts` (`recordPolicyChangeForm`) does change, because
  `createPolicyLog`/`storeGeneratedPolicyAttachment` now need `orgId`.

**Other callers**

- `backend/src/routes/policies.ts` (change-form log + generated attachment),
  `backend/src/routes/mail.ts` (`createPolicyLog`),
  `backend/src/jobs/dispatcher.ts` (already resolves `orgId` via
  `resolveOrgId`), `backend/src/db/seed/financials.ts` (thread the seed's
  `orgId` in, matching `seedPolicies`).

**Tests**

- `backend/src/routes/testHelpers.ts` — `ctx.log()` passes an org; new
  `invoice()`/`payment()` fixtures if the numbering tests want them; re-check
  `cleanup()` ordering now that these rows carry `org_id` (see Tests below).
- Existing: `routes/policyLogs.test.ts`, `policyAttachments.test.ts`,
  `policyLogAttachments.test.ts`, `invoices.test.ts`, `payments.test.ts`,
  `accountingDocuments.test.ts`, `src/accountingLogs.test.ts`,
  `src/accountingDocuments.test.ts`, `jobs/reminders.test.ts`.
- New: `routes/receipts.test.ts`, `routes/trustLedger.test.ts`,
  `routes/policyActivities.test.ts`, and a numbering test (either
  `repositories/invoices.test.ts` or a section in `routes/invoices.test.ts`).

**Docs**

- `docs/API.md` — accounting sections (~lines 567–641) mention `invoiceNumber` /
  `receiptNumber`; note the number is per organization and the uid is still the
  URL key.
- `docs/multitenancy.md` — move logs/attachments/accounting out of "Not done
  yet (#120, #121)" into the *Done* list, mark rollout steps 4 and 5, and
  resolve the "**Open:** display format" bullet to "plain integer".

## Approach

1. **Schema first.** Drop the two identity defaults. `db:push` against your own
   scratch database (never the shared one, per CLAUDE.md) so the `DROP IDENTITY`
   DDL is exercised before the code depends on it.

2. **Number allocation helper.** In `repositories/organizations.ts`:

   ```ts
   export async function allocateInvoiceNumberInTx(tx: Tx, orgId: string): Promise<number> {
     const [row] = await tx
       .update(organizations)
       .set({ nextInvoiceNumber: sql`${organizations.nextInvoiceNumber} + 1` })
       .where(eq(organizations.id, orgId))
       .returning({ number: sql<number>`${organizations.nextInvoiceNumber} - 1` })
     if (!row) throw new CrossOrgReferenceError()
     return Number(row.number)
   }
   ```

   `RETURNING` sees the post-update value, so `- 1` yields the number just
   allocated. The `UPDATE` takes a row lock on the organization for the rest of
   the transaction, which serializes concurrent invoice creates within one org —
   accepted, and the same shape `docs/multitenancy.md` specifies. Receipts get
   the sibling function. Both take the caller's `tx`, never `db`, so the
   allocation rolls back with the rest of the create.

3. **Logs.** `insertPolicyLogInTx(tx, orgId, input)` sets `orgId` on the insert
   and scopes the `max(logNumber)` sub-select by `orgId` as well as `policyId`.
   `createPolicyLog(orgId, input)` scopes its `autoPolicies` parent check by
   `orgId` (it already returns `undefined` for a missing policy, which the route
   maps to 404, so a cross-org policy needs no new error type here).
   `listPolicyLogsByPolicyId(orgId, policyId)` adds `eq(policyLogs.orgId, orgId)`
   to the `where`. Leave `withLogNumberRetry` alone.

4. **Attachments.** `attachmentKeyPrefix(orgId, policyId)` returns
   `org/${orgId}/policies/${policyId}/`, so keys become
   `org/<org_id>/policies/<policy_id>/<uuid>-<name>`. The presign route builds
   the key from `req.orgId!`, and the confirm route's `startsWith` cross-check
   uses the same prefix — which now also makes a confirm for another org's
   presigned key impossible. Existing R2 objects keep their old
   `policy-attachments/...` keys and are orphaned (accepted, per the issue);
   downloads keep working because `GET /policy-attachments/:id/link` presigns
   from the stored `storageKey`, not from a recomputed prefix.
   `createPolicyAttachment` and `storeGeneratedPolicyAttachment` set `orgId`;
   the latter also sets `orgId` on the `policyLogAttachments` link row it
   inserts directly and scopes the `linkToLogId` insert to logs in the same org.
   `findPolicyAttachmentById(orgId, id)`,
   `countAttachmentsCreatedTodayByUser(orgId, userId)` (a per-org quota) and
   `markAttachmentsVoidedBySource(orgId, …)` all filter by `orgId`.

5. **Link rows.** `linkAttachmentsToLog(orgId, input)` scopes both parent
   lookups — the log and every attachment — by `orgId`, so a cross-org id
   answers `log_not_found` / `attachment_not_found` exactly as a missing one
   does (404), and keeps the existing same-policy check on top.
   `listPolicyLogAttachmentsByPolicyId` filters the join by
   `policyLogs.orgId`; `unlinkPolicyLogAttachment(orgId, id)` adds `orgId` to
   the delete's `where`.

6. **Invoices.** `createInvoiceWithDetails(orgId, input)`:
   - scope the policy lookup by `orgId` (returns `undefined` → 404);
   - for any item carrying an explicit `carrierId`, verify that carrier is in
     `orgId` and throw `CrossOrgReferenceError` otherwise (this is the one
     caller-supplied parent FK in the accounting half; `app.ts` already maps it
     to 409);
   - allocate the number *after* those checks and inside the same transaction,
     then insert `invoices` with `{ orgId, invoiceNumber }` and `invoiceItems`
     with `orgId`;
   - pass `invoiceNumber` (not `invoice.id`) to `invoiceCreatedLogBody`.

   `voidInvoice(orgId, id, …)` scopes the invoice `SELECT`, the active-payments
   `SELECT` and the `UPDATE` by `orgId`, and passes `invoice.invoiceNumber` to
   `invoiceVoidedLogBody`. The read helpers add `eq(invoices.orgId, orgId)` to
   their `where` — a wrong-org `clientId`/`policyId` query parameter then simply
   returns `[]` without needing a separate parent check.

7. **Payments and receipts.** `recordPayment(orgId, input)` scopes the invoice
   lookup by `orgId`, allocates the receipt number from the org counter in the
   same transaction, and sets `orgId` on the `payments`, `trustLedger` and
   `receipts` inserts (including the ones in `postSweepAndFeeEntries`).
   `voidPayment(orgId, …)` scopes the payment, invoice, receipt, ledger and
   log writes, and sets `orgId` on the reversing ledger rows. The `receipts.ts`
   and `trustLedger.ts` read functions add `orgId` to their `where`; the two
   `getTrustBalanceBy*` aggregates likewise, so a wrong-org id yields `0.00`
   rather than another agency's balance.

8. **Routes.** Mechanical: `req.orgId!` as the first argument everywhere, and
   the existing 404/409 branches are unchanged because a cross-org row now
   resolves to the same "not found" as a missing one. Two exceptions worth
   naming:
   - `routes/policyActivities.ts` reads through `listScheduledEmails`, which is
     not org-scoped until #121. Resolve the policy first with
     `findAutoPolicyById(req.orgId!, policyId)` and 404 when it is missing; that
     closes the cross-tenant read without pulling #121's scope forward.
   - `routes/accountingDocuments.ts` already has `req.orgId!` for
     `documentHeader`; extend it to the `getInvoiceWithDetails` /
     `getReceiptWithDetails` / `storeGeneratedPolicyAttachment` /
     `markAttachmentsVoidedBySource` calls, and build the PDF file names from
     the numbers (`Invoice #12.pdf`, `Receipt #7.pdf`).

9. **Numbers on documents.** `formatDocumentNumber(n: number)` still returns
   `#${n}`. `buildAccountingDocumentPdf` prints `invoice.invoiceNumber` for the
   invoice title/summary row and `meta.receipt.receiptNumber` for the receipt
   title and the payment-row suffix. `accountingLogs.ts` bodies switch from
   `Invoice #<uid>` to `Invoice #<invoiceNumber>`. `invoiceNumber` /
   `receiptNumber` need no explicit work to reach API responses — the detail and
   list queries select whole rows — but assert their presence in tests so a
   later column list can't silently drop them.

10. **Update paths.** Audit confirms this half has **no** `PATCH` route and no
    `.partial()` update body carrying a parent FK: logs and attachments are
    append-only, invoices and payments are immutable (corrections are voids),
    receipts and the trust ledger are read-only. The #119 review's "a `PATCH`
    can repoint a row at another org's parent" hazard therefore has no surface
    here — but re-check `routes/schemas.ts` while implementing, and if any
    update body does turn up, org-check the FK in the repository and add the
    owned-row-repointed-at-another-org test the issue asks for.

11. **Callers and docs.** Thread `orgId` through `routes/policies.ts`,
    `routes/mail.ts`, `jobs/dispatcher.ts` and `db/seed/financials.ts`; update
    the `repositories/index.ts` header comment; then `docs/API.md` and
    `docs/multitenancy.md`.

## Tests

Backend, vitest + `TestContext`. Never `db:seed`; run the suite against your own
scratch database (`docker compose exec -T db createdb -U postgres myapp_<agent>`,
inline `DATABASE_ADMIN_URL`/`DATABASE_URL`, `db:push`, `db:bootstrap`) because
the identity-drop DDL is destructive.

- **Fixtures.** `ctx.log(policyId, authorId, body)` now needs an org — default
  it to the context org like `ctx.cookie()` does, with an optional override for
  cross-org cases. Add `ctx.invoice()` / `ctx.payment()` builders if the
  numbering tests read cleaner that way.
- **Cleanup ordering.** Every table here now writes `org_id`, which is an FK to
  `organizations`, so `ctx.cleanup()` must have removed the rows before it
  deletes the organizations. Today every one of these tables cascade-deletes
  from `auto_policies`, and policies are deleted before organizations, so the
  existing order should hold — verify it explicitly (a leftover row surfaces as
  an FK error on the org delete, the same failure commit `61d9800` fixed for
  drivers/persons) and add an org sweep if anything is created outside a tracked
  policy.
- **Wrong-org case per route file** — mirroring `routes/vehicles.test.ts`:
  another `ctx.org()`, a row built in it, then assert the caller's list omits it
  and every by-id route 404s. One each for `policyLogs`, `policyAttachments`
  (list, `/link`, presign, confirm), `policyLogAttachments` (list, POST link
  against another org's log *and* another org's attachment, DELETE),
  `invoices` (list by both filters, detail, POST for another org's policy,
  void), `payments` (list, detail, POST against another org's invoice, void),
  and new files for `receipts`, `trustLedger` (list **and** `/trust-balance`,
  which must come back `0.00`) and `policyActivities`.
- **Cross-org carrier on an invoice item** — POST an invoice whose sweep item
  names another org's `carrierId`; expect 409 and no invoice created.
- **Numbering.** Two orgs each create three invoices (and three payments →
  receipts); assert each org sees 1, 2, 3 in creation order and that the
  organization rows' counters moved independently.
- **Rollback does not burn a number.** Drive a create that fails *inside* the
  transaction after allocation — an item `amount` overflowing
  `numeric(12,2)` (e.g. `"99999999999.99"`) raises inside the invoice-items
  insert — then assert the next successful invoice in that org gets the number
  the failed one would have taken, and that the other org's numbering is
  untouched. Repository-level is the easiest place for this since the route's
  zod body may reject the value first; check `createInvoiceBody` and pick
  whichever lever still reaches the transaction.
- **Numbers on responses and documents.** Assert `invoiceNumber` /
  `receiptNumber` come back alongside `id` from the invoice, payment and
  receipt routes; update `src/accountingLogs.test.ts` (wording now carries the
  number) and `src/accountingDocuments.test.ts`
  (`formatDocumentNumber(12) === "#12"`).
- Re-run the whole backend suite plus `tsc` and lint; the frontend needs no
  change, so its existing lint/build is enough if anything under `frontend/`
  is touched at all (expected: nothing).

## Touches backend

yes

## Risks / open questions

- **The organization row lock.** Allocating from a counter serializes invoice
  (and receipt) creation per organization for the duration of the transaction.
  That is the design in `docs/multitenancy.md` and fine at this scale, but the
  transaction also does the log-number `max()+1` and a `withLogNumberRetry`
  retry re-runs the whole thing — keep the counter `UPDATE` as late as
  correctness allows so the lock is held briefly.
- **`paymentVoidedLogBody` still identifies the payment by uid.** Payments have
  no per-org number; the issue only asks for invoice and receipt numbers. Plan
  is to leave `Payment #<uid>` in that one log line (and switch the invoice
  reference in it to the number). Flag if the reviewer would rather it name the
  receipt number.
- **Orphaned R2 objects.** Attachments uploaded before this change keep their
  old keys and are not migrated; the issue accepts this. Nothing breaks, because
  reads use the stored key.
- **`org_id` is still nullable**, so rows written by the paths #121 owns
  (scheduled emails, reminder planner) continue to land with `org_id NULL`. The
  wrong-org tests here must not assume `NOT NULL`.
- **Legacy rows with `org_id NULL`** in the shared dev database become
  invisible to every org once these filters land. Expected, and consistent with
  #119.
- **Identity drop via `db:push`.** `DROP IDENTITY` on a populated table is the
  one genuinely destructive bit of DDL in this change; existing
  `invoice_number` / `receipt_number` values are kept, but the new counters on
  `organizations` start at 1 and can collide with a pre-existing number in the
  same org. Only relevant to databases that already have accounting rows
  carrying an `org_id`; today they are all `NULL`, so the unique constraint
  won't fire. Worth a sentence in the implementation notes.

## Out of scope

- Email templates, reminder rules, scheduled emails, the reminder
  planner/scheduler, and restoring `org_id NOT NULL` (sub-issue 7 / #121) —
  including org-scoping `listScheduledEmails` itself; `policyActivities` gets a
  policy-level org check only.
- Row-level security (sub-issue 8 / #122).
- Frontend display of the numbers — the invoice and payment dialogs keep showing
  the raw uid (sub-issue 9).
- The display *format* of the number beyond a plain integer (no per-agency
  prefix).
- Backfilling or re-keying existing R2 objects.
