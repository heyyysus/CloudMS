---
issue: 87
status: pending-review
---
# Policy Accounting tab as a running-balance ledger

## Goal

Today the Accounting subtab under a policy (`ClientDetail` → `PolicySubtabs` →
`accounting` slot) renders `ClientInvoices`: a flat list of invoice cards
filtered to the policy, each showing status, total and amount due. There is no
chronology, no payment rows, and no balance.

"Done" means that subtab reads like a real accounts-receivable ledger for the
one policy:

- A **balance summary** at the top: total charged, total paid, and the current
  **policy balance** — rendered positive when the client owes and negative
  (styled as a credit) when the arithmetic goes the other way.
- A **chronological table**, oldest → newest, one row per accounting event:
  invoice created (a charge/debit), payment recorded (a credit), and the void
  of either. Columns: date, type, reference (Invoice #N / Receipt #N),
  description, charge, credit, **running balance**.
- Void rows are visibly void (struck through / muted, with the void reason) and
  contribute 0 to the running balance — accounting records here are immutable
  and corrections are voids, so they must stay visible rather than disappear.
- The existing actions survive: **Pay** on an open invoice and clicking an
  invoice to open the printable receipt/invoice dialog.

One thing the issue asks for that the current data model cannot produce, called
out here rather than silently designed around: **a negative (credit) balance is
not reachable today.** A payment applies at most what the invoice still owes;
any excess is `changeGiven` and is handed back, never held on account. So
`sum(charges) - sum(credits)` floors at zero. The ledger arithmetic below is
written to handle negatives correctly and the UI renders them, but producing
one needs unapplied-payment / on-account-credit support in the backend — see
Risks. This plan builds the ledger; it does not add credits.

## Scope check

Fits. PROJECT.md lists accounting (invoices, payments, receipts, trust ledger)
as built, and this is a presentation layer over data that already exists —
no new pillar, no roadmap reordering. It is closest to roadmap item 1's spirit
(make the existing screens real) without touching the Home dashboard.

Triage labels look **right**: `enhancement`, `area:frontend`. Everything below
is frontend-only; the four API endpoints needed already exist and are
documented in `docs/API.md` § Accounting. The one judgement call is that
`area:backend` is *not* needed — confirmed by checking that
`GET /invoices?policyId=` and `GET /payments?policyId=` already return
everything the ledger consumes.

## Files / areas

Add:

- `frontend/src/lib/policy-ledger.ts` — pure builder: invoices + payments →
  ordered ledger rows with running balance, plus the summary totals.
- `frontend/src/lib/policy-ledger.test.ts` — plain unit tests (matches the
  `src/lib/*.test.ts` convention, e.g. `policy-status.test.ts`).
- `frontend/src/components/clients/policy-ledger.tsx` — the card: summary
  header + ledger table, loading/error/empty states, Pay + receipt callbacks.
- `frontend/src/components/clients/policy-ledger.stories.tsx` — story-as-test
  coverage, ported from `client-invoices.stories.tsx`.
- `frontend/src/components/ui/table.tsx` — vendored shadcn `Table` primitives
  (owned source over Radix-free plain markup, same as the rest of `ui/`). Note
  `docs/frontend-ui-design.md` line 10 defers **TanStack Table** deliberately;
  this ledger needs no sorting/pagination/virtualization, so keep it deferred —
  vendor the presentational `table.tsx` only.

Change:

- `frontend/src/api/payments.ts` — add a list function; the file currently only
  has `recordPayment` / `voidPayment`.
- `frontend/src/pages/ClientDetail.tsx` — swap `ClientInvoices` for
  `PolicyLedger` in the `accounting` slot (line ~330); the `onPay` /
  `onSelect` handlers already there (`openInvoiceDialog`, `openReceiptDialog`)
  are reused unchanged.

Remove (after porting story coverage):

- `frontend/src/components/clients/client-invoices.tsx` and
  `client-invoices.stories.tsx` — `ClientInvoices` has exactly one caller (the
  accounting slot), so once the ledger replaces it, it is dead code. If review
  prefers to keep a plain invoice list alongside the ledger, keep both and skip
  this deletion; that is a reversible call.

Docs: no `docs/API.md` change (no new endpoints).
`docs/frontend-ui-design.md` gets a short note if `table.tsx` is added, since
that file inventories the vendored `ui/` primitives.

## Approach

1. **API client.** In `frontend/src/api/payments.ts`, add

   ```ts
   export function getPaymentsByPolicy(policyId: number, signal?: AbortSignal): Promise<InvoicePayment[]>
   ```

   hitting `/payments?policyId=${policyId}`. Reuse the existing
   `InvoicePayment` type from `api/invoices.ts` (it already has `voidedAt`,
   `voidedBy`, `voidReason`, `amountApplied`, `changeGiven`) rather than
   introducing a second payment shape. Follow the `request(...)` + `signal`
   pattern used by `getInvoices`.

2. **Ledger builder** (`lib/policy-ledger.ts`), pure and separately testable:

   ```ts
   export type LedgerRowKind = 'invoice' | 'payment' | 'invoice_void' | 'payment_void'
   export interface LedgerRow {
     key: string            // e.g. `invoice-10`, `payment-4-void`
     at: string             // ISO timestamp used for ordering
     kind: LedgerRowKind
     reference: string      // "Invoice #10", "Payment #4"
     description: string
     chargeCents: number    // 0 when not a charge
     creditCents: number    // 0 when not a credit
     balanceCents: number   // running balance after this row
     invoiceId?: number     // for the Pay / receipt actions
     isVoid: boolean
     voidReason?: string | null
   }
   ```

   - All arithmetic in integer cents via `toCents` from `lib/money.ts`, and
     format only at render with `formatMoney` / `centsToDecimalString` — the
     API's decimal strings may drop trailing zeros (`"300"` == `"300.00"`), so
     never string-compare them.
   - Rows: each **invoice** → charge of `invoice.total`; each **payment** →
     credit of `payment.amountApplied` (**not** `amount` — `amount - applied`
     is `changeGiven`, money handed straight back and never held).
   - **Voids.** Invoices and payments carry `voidedAt` on the row itself; there
     is no separate reversal row for them (reversals exist only in
     `trust_ledger`). So emit the original row with `isVoid: true` and
     zero charge/credit, plus a second `*_void` row at `voidedAt` describing
     the correction with 0 effect. Net effect on the balance: a voided invoice
     never charges, a voided payment never credits. Cross-check against
     `backend/src/repositories/payments.ts` `voidPayment` — it reopens the
     invoice and reverses trust entries, so a voided payment's invoice is once
     again outstanding, which this rule produces naturally.
   - **Order.** Both list endpoints return **newest first**; the running
     balance requires oldest-first, so sort ascending by `(at, id)` before the
     reduce. Render newest-last so the final row carries the current balance
     (add a note in the component if review wants newest-first display — that
     needs the balance computed first, then the array reversed).
   - Also export `summarizeLedger(rows)` → `{ chargedCents, creditedCents,
     balanceCents }` for the header, so the header and the last row can never
     disagree.

3. **Component** (`components/clients/policy-ledger.tsx`). Props mirror the
   ones `ClientInvoices` already takes so `ClientDetail` barely changes:
   `{ policyId, onPay, onSelect, getInvoicesFn?, getPaymentsFn? }` (the
   injectable fetchers are how the existing stories drive the component without
   MSW — keep that).

   - Two `useQuery` calls. Keep the invoices one on the **existing shared key**
     `['invoices', 'byClient', clientId]` and filter to `policyId` client-side,
     exactly as `ClientInvoices` does today (its comment explains why: one
     cache entry shared across every policy's Accounting subtab, and the
     invoice mutations elsewhere in `ClientDetail` already invalidate that
     key). Add payments under `['payments', 'byPolicy', policyId]`. **Verify
     during implementation** that every place that records/voids a payment
     invalidates the new payments key too — otherwise the ledger goes stale
     after a payment. Grep `invalidateQueries` in `ClientDetail.tsx` and
     `invoice-payment-dialog.tsx`.
   - Combine `isPending` / `isError` across both queries; reuse the `Skeleton`
     rows and the `text-destructive` error line from `ClientInvoices`.
   - Header: three stat lines (Charged / Paid / Balance). Balance uses
     `INVOICE_STATUS_TEXT_CLASS`-style semantic colour — owed in the
     destructive/foreground tone, credit in a positive tone, zero muted. Label
     it explicitly ("Balance due" / "Credit balance") rather than relying on a
     minus sign alone.
   - Table: `<Table>` primitives, right-aligned money columns, `tabular-nums`
     on the numeric cells. Charge and credit in separate columns (a real
     ledger), running balance last.
   - Actions: the invoice row's reference cell is a button calling
     `onSelect(invoiceId)`; open invoices get a `Pay` button calling
     `onPay(invoiceId)`. Keep them **siblings, never nested** — the existing
     comment in `client-invoices.tsx` (lines 67-68) exists because nesting
     broke the controls.
   - Empty state: "No accounting activity for this policy."
   - Dates via `lib/date-display.ts` / `log-datetime.ts` — do not hand-roll
     formatting.

4. **Wire it up** in `ClientDetail.tsx`: replace the `ClientInvoices` element
   in the `accounting` slot with `<PolicyLedger policyId={policy.id}
   clientId={client.id} onPay={...} onSelect={...} />`, keeping the two
   existing handlers. Then delete `client-invoices.tsx` + its stories.

5. **Do not use `/trust-balance` or `/trust-ledger` here.** That is the
   *agency's* trust-account balance, which nets to `0.00` once an invoice is
   collected and swept — it answers a different question and would read as an
   always-zero "balance" on this tab. The client-facing balance is
   `charges − credits` as built above. Worth a code comment so the next reader
   doesn't "fix" it.

## Tests

Frontend only (no backend files change).

- `frontend/src/lib/policy-ledger.test.ts` — plain Vitest unit tests over the
  builder: single invoice; invoice + partial payment; invoice + payments that
  close it (balance 0); voided invoice (no charge, row still present); voided
  payment (credit withdrawn, balance back up); a payment with `changeGiven`
  (credits `amountApplied`, not `amount`); ordering when two events share a
  timestamp; empty input.
- `frontend/src/components/clients/policy-ledger.stories.tsx` — stories-as-
  tests through Vitest browser mode, ported from `client-invoices.stories.tsx`
  (it already has fixture invoices with `sweep`/`agency` items and an
  `ApiError` path). Cover: loading skeleton, error, empty, a mixed ledger with
  a running balance assertion via `within(canvas)`, void rendering, and that
  `onPay` / `onSelect` fire with the right invoice id using `fn()`.
- Run `npm run lint` and `npm run build` in `frontend/` (that is what CI runs —
  PROJECT.md notes the frontend Vitest/Storybook suite is **not** wired into CI
  yet, so run `npx vitest run` locally as well and say so in the PR).
- No backend test run needed.

## Touches backend

**No.** Frontend only — `frontend/src/{api,lib,components,pages}`. No schema,
no migration, no new endpoint.

## Risks / open questions

1. **A credit balance cannot occur today.** As above: overpayment becomes
   `changeGiven`, so the balance floors at zero and the "negative if they have
   credit" half of the issue is unreachable without new backend behaviour
   (unapplied payments / on-account credit, a schema + repository change).
   *Question for the issue author:* is showing a credit-capable ledger enough
   for now, or is holding overpayments on account part of this request? If the
   latter, that is a separate backend issue and this one should be scoped to
   the ledger view.
2. **Payments cache invalidation.** New query key — every payment write path
   must invalidate it or the ledger shows a stale balance right after the user
   records a payment. Highest-risk detail in this plan; verify explicitly.
3. **Void display convention.** Emitting both the original row and a `*_void`
   row is the audit-friendly reading, but it doubles rows for voided items. The
   alternative (one row, struck through, annotated with the void reason) is
   less noisy. Recommendation: start with the two-row form since it preserves
   chronology, and let review collapse it if it reads badly.
4. **Newest-first vs oldest-first.** Every other list on this screen (logs,
   invoices, activities) is newest-first; a ledger conventionally reads
   oldest-first so the balance accumulates downward. Going with oldest-first
   and flagging the inconsistency.
5. **Vendoring `table.tsx`** is the first real table primitive in the repo. It
   is presentational only and does not undo the deliberate TanStack Table
   deferral, but it is a design-system decision worth a reviewer's eye.
6. Timestamps: invoice `createdAt` and payment `createdAt` are second-or-
   better precision, but an invoice and its immediate payment can land close
   together — hence the `(at, id)` tiebreak.

## Out of scope

- Any backend change: no new endpoints, no schema migration, no unapplied-
  payment/credit support, no changes to void semantics.
- The **client-level** (all policies) accounting view — this issue says "under
  the Policy". The builder is policy-scoped but written so a client-scoped
  caller could reuse it later.
- Exporting/printing the ledger (PDF/CSV). The existing per-invoice receipt and
  invoice PDFs are untouched.
- Editing or deleting accounting records — they are immutable by design.
- Aging buckets (30/60/90), statements, or dunning.
- Wiring the frontend Vitest/Storybook suite into CI (a known gap in
  PROJECT.md, tracked separately).
