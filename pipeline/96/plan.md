---
issue: 96
status: pending-review
---
# Restyle the Accounting subtab to match the Logs table

## Goal

The Accounting subtab (`PolicyLedger`) currently renders a shadcn `<Table>`, while
Logs and Attachments render a fixed-column CSS grid with a sticky header, zebra
rows and full-row click targets. "Done" means the Accounting ledger reads as the
same component family as Logs: same container chrome, header, row density,
striping, hover/focus treatment and click-a-row-to-open behaviour — with no
change to what the ledger computes or to which dialogs it opens.

Concretely:

- The ledger rows live in the Logs-style scroll container
  (`max-h-96 overflow-y-auto rounded-md border bg-background font-mono text-sm`)
  with a `sticky top-0` header row.
- Rows are click targets for the whole row (opening the invoice receipt), not
  just the reference link.
- Charge / Credit / Balance stay right-aligned and `tabular-nums`.
- The "Pay" action on open invoices, the three summary tiles, the void
  strikethrough/void-reason treatment, and the loading / empty / error states all
  still work.

The issue says "maybe not exactly the same", so the ledger keeps what is
genuinely accounting-specific (summary tiles, money alignment, the Pay button);
similarity applies to chrome and interaction, not to column set.

## Scope check

Fits PROJECT.md's "Frontend" current state — the design system in
`docs/frontend-ui-design.md` is explicitly the thing feature work should build on
consistently, and this issue is that consistency work applied to the newest tab
(Accounting shipped in #93). It is not on the numbered Direction list, which is
fine: it is polish on an existing screen rather than new capability.

Triage labels look right: `enhancement`, `area:frontend`. There is no backend
change here — no new endpoint, no schema change — so no `area:backend`.

One doc consequence worth naming: `docs/frontend-ui-design.md` line 10 says
`src/components/ui/table.tsx` was "vendored for the policy accounting ledger".
`PolicyLedger` is the only consumer of that file in the whole frontend
(`grep -rn "components/ui/table" frontend/src`), so this change leaves it
unused. See Approach step 6.

## Files / areas

Change:

- `frontend/src/components/clients/policy-ledger.tsx` — the actual restyle.
- `frontend/src/components/clients/policy-ledger.stories.tsx` — play functions
  need to survive the markup change (see Tests).
- `frontend/src/components/clients/policy-logs.tsx`,
  `frontend/src/components/clients/policy-attachments.tsx` — adopt the shared
  class constants from the new module (no visual change intended).
- `docs/frontend-ui-design.md` — note the shared record-list convention and
  update the `table.tsx` sentence.

Add:

- `frontend/src/components/clients/record-list.ts` — the shared Tailwind class
  strings for the container, header row and body row. Plain `.ts`, no
  components, so it is not subject to `react/only-export-components`.

Do not change: `frontend/src/lib/policy-ledger.ts` (`buildPolicyLedger`,
`summarizeLedger`, `LEDGER_ROW_KIND_LABEL`), `frontend/src/pages/ClientDetail.tsx`
(the `onPay`/`onSelect` wiring into `openInvoiceDialog`/`openReceiptDialog` is
unchanged), and any backend file.

## Approach

1. **Extract the shared chrome.** Create
   `frontend/src/components/clients/record-list.ts` with the three class strings
   that `policy-logs.tsx` and `policy-attachments.tsx` already duplicate verbatim:

   ```ts
   // Shared chrome for the per-policy record lists (Logs, Attachments,
   // Accounting) so the subtabs read as one component. Each card still owns its
   // own column template; only the container/header/row treatment is shared.
   export const RECORD_LIST_CONTAINER = 'max-h-96 overflow-y-auto rounded-md border bg-background text-sm'
   export const RECORD_LIST_HEADER = 'sticky top-0 z-10 border-b bg-background py-1.5 text-xs font-semibold text-muted-foreground'
   export const RECORD_LIST_ROW = 'w-full py-1 text-left odd:bg-muted-foreground/15 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none'
   ```

   `font-mono` stays per-card (Logs has it, Attachments does not), as does the
   cursor utility (`cursor-grab` in Logs, `cursor-pointer` in Attachments — note
   the divergence but do not "fix" it in this issue).

2. **Point Logs and Attachments at the constants.** Replace the inline strings in
   both files with `cn(GRID, RECORD_LIST_ROW, ...)` etc., keeping their existing
   per-card `*_GRID` constants and their extra modifiers exactly as they are. This
   must be a pure refactor — if their stories change behaviour, something drifted.

3. **Define the Accounting column template.** Add a `LEDGER_GRID` constant next to
   the component, in the same commented style as `LOG_GRID` in
   `policy-logs.tsx:33`. Eight columns, matching the current `TableHead` order —
   date/time, type, reference, description (the only one that grows), charge,
   credit, balance, action:

   ```ts
   const LEDGER_GRID =
     'grid grid-cols-[11rem_6rem_7rem_minmax(0,1fr)_6rem_6rem_6rem_3.5rem] items-center gap-x-3 px-2'
   ```

   Tune widths against the real strings: `formatLogTimestamp` renders
   "MM/DD/YYYY - hh:mmpm" (11rem in Logs), `LEDGER_ROW_KIND_LABEL` values are up
   to "Payment void", references are "Invoice #10" / "Payment #5", and money is
   `formatMoney(centsToDecimalString(...))`.

4. **Replace the `<Table>` block with the grid.** Swap the
   `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` tree for
   the `RECORD_LIST_CONTAINER` div + `cn(LEDGER_GRID, RECORD_LIST_HEADER)` header
   spans + one row per `LedgerRow`, carrying over every existing per-row rule:
   `row.isVoid && 'text-muted-foreground'`, `line-through` on the reference and
   description, the `voidReason` sub-line for `*_void` rows, blank cells when
   `chargeCents`/`creditCents` are 0, and `text-right tabular-nums` on the three
   money columns. Add `font-mono` to the container so the numbers align the way
   the Logs table does. Drop the `Table*` imports.

5. **Make the whole row clickable without nesting buttons.** Logs makes the row
   itself a `<button>`; Accounting cannot, because open-invoice rows contain a
   Pay `<Button>` and a button inside a button is invalid HTML (the same
   constraint that made `SelectionBox` in `policy-attachments.tsx:47`
   presentational). Use the stretched-overlay pattern instead:

   - Row wrapper is `<div className={cn(LEDGER_GRID, RECORD_LIST_ROW, 'relative', ...)}>`.
   - Inside it, an absolutely-positioned `<button type="button" className="absolute inset-0"
     aria-label={\`Open ${row.reference}\`} onClick={() => onSelect(row.invoiceId)} />`
     covers the row. Every row kind has an `invoiceId`, so payment rows open the
     same receipt as their invoice — an improvement on today, where only the
     reference text is clickable and only on invoice rows. Keep the
     `focus-visible` ring on the wrapper via `has-[:focus-visible]:` or move the
     ring utilities onto the overlay button.
   - The Pay `<Button>` in the last column gets `relative z-10` so it sits above
     the overlay and keeps its own click.
   - The reference cell becomes a plain `<span>` (the overlay now owns that
     click), keeping the `line-through` void treatment.

   If the overlay proves awkward in the Storybook/Chromium run, the fallback is
   to keep the row a plain non-interactive grid and leave the reference cell as
   the only button — visually identical, less of the Logs interaction. Prefer the
   overlay; note the fallback rather than silently taking it.

6. **Leave `Card`, the summary tiles and all three states alone**, then update
   `docs/frontend-ui-design.md`: amend the `table.tsx` sentence (it is no longer
   the accounting ledger's markup — either say it is currently unused and kept as
   vendored source, or delete `src/components/ui/table.tsx`; deleting is the
   cleaner end state but is a judgement call worth flagging in the PR), and add a
   line under Conventions describing `record-list.ts` as the shared chrome for
   per-policy record lists.

## Tests

Frontend only. There is no vitest-in-CI for the frontend (PROJECT.md names this
gap), so run the suite locally:

- `cd frontend && npx vitest run --project=storybook` — the Storybook stories are
  the test suite, executed in real Chromium.
- `cd frontend && npm run lint && npx tsc -b && npm run build`.

Story work in `policy-ledger.stories.tsx`:

- `RunningBalance` asserts `canvas.findByText('Invoice #10')` then clicks it and
  expects `onSelect(10)`. With the overlay the click lands on the overlay button,
  which still calls `onSelect(10)` — verify it actually passes in the browser run
  rather than assuming; if the covered text is no longer a reliable click target,
  switch to `canvas.getByRole('button', { name: /open invoice #10/i })`.
- The same story clicks `getByRole('button', { name: /pay/i })`. Add an assertion
  that clicking Pay does **not** also fire `onSelect` — that is the exact
  regression the `z-10` overlay ordering exists to prevent.
- Add a story (or extend `VoidedPayment`) asserting a payment row opens its
  invoice: click `Payment #5`, expect `onSelect(10)`. This is new behaviour from
  step 5 and should be pinned.
- `FiltersByPolicy`, `VoidedPayment`, `Loading`, `Empty`, `LoadError` should pass
  unchanged; if any needs edits, the restyle changed behaviour it should not have.
- Re-run `policy-logs.stories.tsx` and `policy-attachments.stories.tsx` after
  step 2 — unchanged output is the proof the extraction was pure.

## Touches backend

No.

## Risks / open questions

- **Nested interactive elements.** The main real risk. Getting the overlay,
  focus ring and `z-10` ordering right is the bulk of the work; a mistake means
  Pay silently opens the receipt dialog instead of the payment dialog.
- **Column widths at narrow viewports.** Eight fixed-ish columns is materially
  wider than Logs' four. The grid does not wrap, so on a narrow window the
  description column collapses toward zero before horizontal scrolling kicks in.
  Consider `overflow-x-auto` on the container alongside `overflow-y-auto`, and
  check the card at a typical laptop width inside `ClientDetail`'s layout.
- **`src/components/ui/table.tsx` becomes dead code.** Delete it or keep it as
  vendored source? Deleting also means the design doc's "TanStack Table remains
  deferred" paragraph needs a small edit. Flag for the reviewer; do not decide
  unilaterally in a visual-polish PR.
- **How far to push shared extraction?** This plan extracts class strings only,
  not a `<RecordList>` component. A real shared component (column config, header,
  rows, states) is the better long-term answer but is a larger refactor across
  three cards with different row semantics — worth its own issue.
- **"Maybe not exactly the same" is the issue's only spec.** If the reviewer
  wants specific divergences (e.g. drop the summary tiles, or drop the inline Pay
  button in favour of paying from the receipt dialog), that should come back as
  review feedback — this plan assumes behaviour is preserved.

## Out of scope

- Any backend change: no invoice/payment/ledger endpoint or schema work.
- Changing what the ledger computes — `frontend/src/lib/policy-ledger.ts` is
  untouched.
- Restyling `PolicyActivities`, which uses a card-per-row layout rather than a
  table and is a separate visual-consistency question.
- Sorting, pagination, filtering, virtualization, or adopting TanStack Table.
- Wiring the frontend test suite into CI (Direction item 1, its own issue).
- Changing the subtab order or labels in `policy-subtabs.tsx`.
