# Implementation notes — issue #96

## What changed

- Added `frontend/src/components/clients/record-list.ts`: the shared
  `RECORD_LIST_CONTAINER` / `RECORD_LIST_HEADER` / `RECORD_LIST_ROW` class
  strings, extracted verbatim from `policy-logs.tsx` / `policy-attachments.tsx`.
- `policy-logs.tsx` and `policy-attachments.tsx` now import those constants
  instead of duplicating the strings inline. Pure refactor — no `*_GRID`
  constants, per-card modifiers (`cursor-grab`, `font-mono`, selection state),
  or story behaviour changed.
- `policy-ledger.tsx` (`PolicyLedger`) no longer renders the shadcn `<Table>`.
  It now uses the same fixed-column CSS grid pattern as Logs/Attachments: an
  8-column `LEDGER_GRID`, the shared container/header/row chrome, and
  `font-mono` on the container (Logs has it, so Accounting money reads the
  same way). `overflow-x-auto` was added alongside the container's existing
  `overflow-y-auto` per the plan's risk note about 8 fixed-ish columns on a
  narrow viewport.
- Row click target: implemented the plan's stretched-overlay pattern — the
  row `div` is `position: relative` with an `absolute inset-0` overlay
  `<button aria-label="Open {reference}">` that calls `onSelect(row.invoiceId)`,
  and the Pay button gets `relative z-10` so it sits above the overlay and
  keeps its own click without also firing `onSelect`. Every ledger row
  (invoice and payment) has an `invoiceId`, so payment rows now open their
  invoice's receipt too — this is new behaviour vs. today (only the invoice
  reference text was clickable before), called out in the plan and pinned
  with a story assertion.
  - The row's focus ring uses `has-[:focus-visible]:ring-2 ring-ring
    ring-inset` on the wrapper (the div itself isn't focusable, only the
    overlay button is) rather than the plain `focus-visible:` classes in
    `RECORD_LIST_ROW`, which are inert here but harmless.
- Deleted `frontend/src/components/ui/table.tsx` (the vendored shadcn
  `Table`/`TableHeader`/.../`TableCell` markup). `PolicyLedger` was its only
  consumer (confirmed via `grep -rn "components/ui/table" frontend/src` —
  no hits after the change) and the plan flagged deleting as "the cleaner end
  state" — chose that over keeping unused vendored source. Updated
  `docs/frontend-ui-design.md`'s Stack section accordingly, and added a new
  Conventions bullet describing the shared record-list chrome and the
  overlay-button pattern for rows with nested interactive elements.
- `policy-ledger.stories.tsx`:
  - `RunningBalance` now clicks `getByRole('button', { name: /open invoice #10/i })`
    instead of the old reference-text click (the reference is a plain `<span>`
    now, not a button). Added an assertion that clicking Pay does not also
    fire `onSelect` (`toHaveBeenCalledTimes(1)`) — the regression the `z-10`
    ordering exists to prevent.
  - `VoidedPayment` extended with a click on `Open payment #5` asserting
    `onSelect(10)` — pins the new payment-row-opens-invoice behaviour.
  - `FiltersByPolicy`, `Loading`, `Empty`, `LoadError` unchanged, and pass
    unchanged (confirms the restyle didn't touch those states).

## Deviations from plan

None of substance. The plan flagged the `table.tsx` fate as "a judgement call
worth flagging in the PR" rather than prescribing it — I deleted it (the
plan's own "cleaner end state" option) since it had zero remaining consumers
after this change. Worth a reviewer glance in case there's a reason to keep
vendored source around instead.

## Checks run

- `cd frontend && npm run lint` — clean (only pre-existing, unrelated
  `react/only-export-components` warnings).
- `cd frontend && npx tsc -b` — clean.
- `cd frontend && npm run build` — succeeds.
- `cd frontend && npx vitest run --project=storybook` — 48 files / 245 tests
  passed, including the updated and extended `policy-ledger.stories.tsx`
  plays and the unchanged `policy-logs.stories.tsx` / `policy-attachments.stories.tsx`
  runs (proof the chrome extraction was pure). Playwright's Chromium browser
  wasn't preinstalled on this runner; ran `npx playwright install --with-deps
  chromium` first.
- Did not run backend checks — no backend files touched.
- Did not do a manual visual pass in a live browser: this runner has no
  `GOOGLE_CLIENT_ID`, and login is Google-only with no password/token flow to
  script around for the live app (per the `verify` skill). Relied on the
  Storybook/Chromium suite instead, which is this project's actual frontend
  test convention (`docs/frontend-ui-design.md`'s Storybook conventions
  section, and PROJECT.md's note that there's no separate vitest-in-CI gap
  once that suite runs) and exercises the real rendered markup and click
  behaviour, not just types.
