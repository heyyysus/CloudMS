# Plan review — issue #96

## Findings

- Scope matches the issue: pure visual/interaction restyle of `PolicyLedger` to
  match the Logs/Attachments record-list chrome, no backend touch, no change to
  what the ledger computes. Confirmed `frontend/src/lib/policy-ledger.ts` is
  correctly left out of the "Change" list.
- Spot-checked the three source files the plan quotes from —
  `frontend/src/components/clients/policy-ledger.tsx`,
  `policy-logs.tsx`, `policy-attachments.tsx` — and the plan's descriptions of
  current markup, class strings (`LOG_GRID`, `ATTACHMENT_GRID`, the container/
  header/row classes), and the `SelectionBox` "no nested interactive elements"
  precedent (`policy-attachments.tsx:47`) are all accurate quotes, not
  paraphrases that drifted from the code.
- `docs/frontend-ui-design.md:10`'s `table.tsx` sentence and the
  `grep -rn "components/ui/table" frontend/src` claim (single consumer:
  `policy-ledger.tsx`) both check out — the doc-update and dead-code call-out
  in step 6 are grounded, not invented.
- Direction: fits PROJECT.md's frontend pillar — this is consistency work on
  top of the existing design system, not new capability, and it doesn't
  conflict with the Direction list's ordering (item 1, CI wiring, is
  explicitly left out of scope rather than silently pulled in).
- Soundness: reuses the exact existing pattern (fixed-column CSS grid, sticky
  header, zebra rows, full-row button) rather than inventing a new one, and
  the new `record-list.ts` shared-constants extraction is a proportionate
  amount of abstraction — it doesn't reach for a `<RecordList>` component,
  which the plan itself flags as a larger, separate-issue-worthy refactor.
- The one real design decision — replacing the invoice-only reference link
  with a full-row stretched-overlay button so payment rows also open their
  invoice — is flagged as new behavior, justified, and pinned with a new
  story rather than snuck in silently. The `z-10` Pay-button-vs-overlay
  ordering is correctly identified as the main risk and gets an explicit
  regression test (Pay must not also fire `onSelect`).
- Tests: Storybook/Chromium via `npx vitest run --project=storybook` is this
  project's actual frontend test convention (PROJECT.md confirms there's no
  vitest-in-CI gap otherwise); TestContext/backend fixtures don't apply since
  there's no backend change, which the plan states explicitly rather than
  omitting the topic.
- Security: no auth/session/input-validation/secrets surface here — purely
  presentational, and the new full-row click passes only an `invoiceId`
  already reachable via existing `onSelect` wiring. No new data exposure.
- Conventions: no CLAUDE.md violations found (concurrent-agents section
  correctly out of scope per the task instructions).

No issues significant enough to reject.

Verdict: approved
