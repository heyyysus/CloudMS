# Implementation notes — issue #87

## What was implemented

Replaced the flat `ClientInvoices` card in the policy Accounting subtab with
`PolicyLedger`, a running-balance ledger, per `plan.md` (approved,
`review.md`):

- `frontend/src/lib/policy-ledger.ts` — pure builder (`buildPolicyLedger`)
  turning a policy's invoices + payments into oldest-to-newest ledger rows
  with a running balance in integer cents, plus `summarizeLedger` for the
  header totals. Voids emit the original row zeroed out (`isVoid: true`) plus
  a second `*_void` row at `voidedAt`, both with zero balance effect, so the
  audit trail stays visible per the plan.
- `frontend/src/lib/policy-ledger.test.ts` — 11 unit tests: empty input,
  single invoice, partial payment, invoice closed to zero, `changeGiven`
  credited as `amountApplied` not `amount`, voided invoice, voided payment
  (credit withdrawn), same-timestamp tiebreak by entity id, and
  `summarizeLedger` matching the builder's totals.
- `frontend/src/components/ui/table.tsx` — vendored via
  `npx shadcn@latest add table` (unmodified registry output).
- `frontend/src/components/clients/policy-ledger.tsx` — the card: three-stat
  header (Charged / Paid / Balance due-or-Credit balance, explicitly labeled
  per the plan rather than relying on a minus sign), the ledger table, and
  loading/error/empty states. Two `useQuery` calls: invoices stay on the
  existing shared `['invoices', 'byClient', clientId]` key (filtered
  client-side to the policy, same as the old component), payments use a new
  `['payments', 'byPolicy', policyId]` key.
- `frontend/src/components/clients/policy-ledger.stories.tsx` — 6
  stories-as-tests (running balance + Pay/onSelect callbacks, policy
  filtering, voided payment rendering, loading, empty, load error), ported
  from `client-invoices.stories.tsx`'s coverage.
- `frontend/src/pages/ClientDetail.tsx` — swapped `ClientInvoices` for
  `PolicyLedger` in the `accounting` slot; handlers unchanged.
- Deleted `client-invoices.tsx` / `.stories.tsx` (dead code, one caller).
- `docs/frontend-ui-design.md` — one-sentence note that `table.tsx` is
  presentational-only and doesn't reopen the deferred-TanStack-Table decision.

## Deviations from the plan

None in scope. Two implementation details the plan left as judgment calls,
resolved as follows:

- **Void double-row form** (plan Risk #3): kept the two-row form (original +
  `*_void`), not collapsed to one struck-through row — matches the plan's own
  recommendation.
- **Oldest-first display** (plan Risk #4): kept, per the plan's reasoning
  (running balance needs to accumulate downward), despite being the one list
  on this screen that isn't newest-first.
- **`client-invoices.tsx` deletion**: deleted, per the plan's default (not the
  "keep both" fallback) — it had exactly one caller and that caller is gone.

## Risk #2 (payments cache invalidation) — resolved

The plan flagged this as the highest-risk detail: a new `['payments',
'byPolicy', policyId]` query key needs every payment write path to invalidate
it, or the ledger goes stale right after a payment. Checked both:

- `invoice-payment-dialog.tsx` (records payments, any of the client's
  policies) — added `invalidateQueries({ queryKey: ['payments', 'byPolicy'] })`
  next to its existing whole-key `policyLogs`/`policyAttachments`
  invalidation, same "can bill any policy, so invalidate the whole key"
  reasoning already used there.
- `invoice-receipt-dialog.tsx` (`refreshAfterVoid`, voids payments/invoices)
  — same whole-key invalidation added alongside its existing calls.

## Reference format

The plan's Goal section sketches the reference column as "Invoice #N / Receipt
#N"; the Approach section's concrete `LedgerRow` spec says `"Payment #4"`. Went
with the Approach section's wording (`Payment #N`) since that's what's
actually fetched (`InvoicePayment`, not a separate receipts list) — no receipts
endpoint is called anywhere in this component.

## Reference cell interactivity

The plan says "the invoice row's reference cell is a button calling
`onSelect(invoiceId)`". Made both `invoice` and `invoice_void` rows'
reference cells clickable (both describe the same invoice and open its
receipt dialog); `payment`/`payment_void` rows render as plain text, since
there's no separate per-payment view and the plan didn't call for one.

## Checks run

- `frontend/`: `npm run lint`, `npm run build` (`tsc -b && vite build`) — both
  clean, no new warnings.
- `npx vitest run` (full suite, including Storybook browser-mode
  stories-as-tests under real headless Chromium via
  `npx playwright install chromium --with-deps`, needed once since the
  runner had no cached browser): 58 files / 325 tests pass, including the new
  `policy-ledger.test.ts` (11) and `policy-ledger.stories.tsx` (6).
- No backend files touched, so no backend checks run (matches plan's "Touches
  backend: No").
- Did not do a live-browser manual check: this is an unattended pipeline
  stage with no user to hand the `verify` skill's browser-cookie step off to.
  The Storybook stories above already render `PolicyLedger` in real Chromium
  and assert on the rendered running balance, void styling, and Pay/onSelect
  wiring, which is the closest available substitute — a human should still
  eyeball the actual subtab once this lands.

## Open item carried from the plan (not this issue's scope)

Plan Risk #1: a credit (negative) balance can't occur with today's backend
(overpayment becomes `changeGiven`, handed back rather than held on account).
The ledger arithmetic and UI both handle negative balances correctly, but
producing one needs backend support for unapplied payments/on-account credit
— a separate issue, per the plan.

## Docs

`docs/frontend-ui-design.md` was already updated in the implementation commit
(note that the vendored `table.tsx` is presentational-only and doesn't reopen
the deferred TanStack Table decision) — no further edit needed there. No other
doc changes needed: `GET /payments?policyId=` was already documented in
`docs/API.md` before this change (only a frontend client wrapper is new, no
route/shape change), and nothing here touches auth/session behaviour or
setup/env/deploy steps.
