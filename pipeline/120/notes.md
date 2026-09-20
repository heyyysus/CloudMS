# Implementation notes — issue #120

## Implemented

Everything scoped in `pipeline/120/plan.md`:

- **Schema**: dropped `.generatedByDefaultAsIdentity()` from
  `invoices.invoiceNumber` / `receipts.receiptNumber`; both are now plain
  `integer(...).notNull()` allocated per organization. Comments rewritten to
  point at `allocateInvoiceNumberInTx` / `allocateReceiptNumberInTx`.
- **Repositories**: `policyLogs`, `policyAttachments`, `policyLogAttachments`,
  `invoices`, `payments`, `receipts`, `trustLedger` all take `orgId` as the
  first parameter and scope every read/write by it. `organizations.ts` grew
  `allocateInvoiceNumberInTx` / `allocateReceiptNumberInTx` (row-locking
  `UPDATE ... RETURNING`, allocated late in the transaction). Attachment
  storage keys are now `org/<org_id>/policies/<policy_id>/...`.
- **Routes**: `policyLogs`, `policyActivities`, `policyAttachments`,
  `policyLogAttachments`, `invoices`, `payments`, `receipts`, `trustLedger`,
  `accountingDocuments` all pass `req.orgId!` through.
  `policyActivities.ts` resolves the policy via the org-scoped
  `findAutoPolicyById` first and 404s if missing, closing the cross-tenant
  read without pulling #121's `listScheduledEmails` scoping forward.
- **Document rendering**: `formatDocumentNumber` takes the allocated number;
  PDFs and file names print `Invoice #<invoiceNumber>.pdf` /
  `Receipt #<receiptNumber>.pdf`; `accountingLogs.ts` bodies print the number
  instead of the row id (payment-void log line still names the payment by
  uid, per the plan's open question — no per-payment number exists).
- **Other callers**: `routes/policies.ts`, `routes/mail.ts`,
  `jobs/dispatcher.ts` (already resolved `orgId` via `resolveOrgId`), and
  `db/seed/financials.ts` all thread `orgId` through the newly-scoped
  repositories. `repositories/index.ts` header comment updated.
- **Docs**: `docs/API.md` accounting section documents `invoiceNumber` /
  `receiptNumber` alongside `id`. `docs/multitenancy.md`: moved logs/
  attachments/accounting from "Not done yet" to "Done (#120)", resolved the
  invoice/receipt-number "Open: display format" bullet to "plain integer, no
  prefix", and marked rollout steps 4 (second half) and 5 done.
- **Tests**: wrong-org tests for every route file the plan named -
  `policyLogs`, `policyAttachments` (list, `/link`, presign, confirm),
  `policyLogAttachments` (list, POST link against a cross-org log *and*
  cross-org attachment, DELETE), `invoices` (list by both filters, detail,
  POST for another org's policy, void), `payments`/`receipts`/`trustLedger`
  (list, detail, `/trust-balance` zeroing), and `policyActivities` (404 for
  another org's policy). Cross-org carrier on an invoice item (409, no
  invoice created). Per-org numbering (two orgs, 1/2/3 independently).
  Rollback-does-not-burn-a-number (numeric overflow inside the invoice-items
  insert). `invoiceNumber`/`receiptNumber` asserted on API responses.
  `accountingLogs.test.ts`/`accountingDocuments.test.ts` updated for the
  numbered wording/`formatDocumentNumber`.

## Decisions

- Schema was pushed with `db:push` against this pipeline's own isolated
  Postgres (the CLAUDE.md shared-DB rules don't apply on this CI runner, per
  the pipeline instructions). One pre-existing `email_templates` row from a
  prior bootstrap needed truncating (cascaded to its one `reminder_rules` /
  `scheduled_emails` row) before `drizzle-kit push` could add the
  `(org_id, key)` unique constraint non-interactively - unrelated to this
  issue's schema change, just a leftover on the scratch DB.
- Per plan step 10's audit, this domain has no `PATCH`/`.partial()` update
  body with a parent FK, so there's no owned-row-repointed-at-another-org
  test to add here (re-verified while implementing; still true).

## Deviations from plan

- The plan's "Tests" section named new files `routes/receipts.test.ts`,
  `routes/trustLedger.test.ts`, and `routes/policyActivities.test.ts`. The
  work already on the branch instead added receipts/trust-ledger wrong-org
  coverage inside `routes/payments.test.ts` (since receipts and the trust
  ledger are only reachable by first recording a payment against an invoice
  in that test file's fixtures) and policyActivities coverage inside
  `jobs/reminders.test.ts` (where the rest of that route's tests already
  live, alongside the scheduled-email fixtures it needs). Kept as-is rather
  than churning working tests into new files - the coverage the plan asked
  for is present, just colocated with the existing suites for those routes.
- Found and fixed a real gap while adding the policyLogs/policyAttachments/
  policyLogAttachments wrong-org tests the plan called for (these three files
  had no cross-org tests yet, unlike the ones above): none were missing in
  the repository/route layer, but the *first* wrong-org test I wrote for
  `DELETE /policy-log-attachments/:id` initially failed against
  `unlinkPolicyLogAttachment`'s actual (correct) org filter - the test itself
  had reversed fixture order (`ctx.org()` called before the caller's own
  `ctx.user()`, so the caller inherited the "other" org as its default per
  `TestContext.defaultOrgId`'s first-call-wins rule). Fixed the test order;
  no production code changed for this.

## For the docs stage / reviewer

- `docs/multitenancy.md`'s intro line ("The rest of this document is the
  plan. None of it is implemented yet") is already stale from #119 and
  wasn't touched here - out of scope for this issue to fix broadly.
- Attachments uploaded before this change keep their old
  `policy-attachments/...` storage key (no prefix) and are not migrated, per
  the plan's accepted risk. Reads still work because they use the stored key
  directly rather than recomputing a prefix.

## Checks run

All from `backend/`, against this pipeline's own isolated Postgres
(`db:push` + `db:bootstrap`, no `db:seed`):

- `npm run typecheck` - clean
- `npm run lint` - clean
- `npm run format:check` - clean (ran `npm run format` once to fix formatting
  left over from the prior session, and once more after adding tests)
- `npm test` (`npx vitest run`) - 453/453 passing
- `npm run build` - clean

Frontend untouched (plan expects no frontend change for this issue); its
lint/build were not run since nothing under `frontend/` changed.
