# Plan review — issue #120

## Findings

- **Scope matches the issue precisely.** Every repository/route pair the issue lists is covered
  (`policyLogs`, `policyAttachments`, `policyLogAttachments`, `invoices`, `payments`, `receipts`,
  `trustLedger`, plus `policyActivities.ts`, `accountingDocuments.ts`, `accountingLogs.ts`,
  `invoiceLabels.ts`, `policyChangeSummary.ts`). Per-org numbering, parent-FK checks on writes, and
  the out-of-scope boundary (email/scheduler/#121, RLS/#122, frontend display/#9) are all named
  explicitly and match the issue body.
- **Spot-checks confirm the plan's factual claims about current code.** `schema.ts` has
  `nextInvoiceNumber`/`nextReceiptNumber` on `organizations` (lines 55–56) and
  `generatedByDefaultAsIdentity()` on `invoices.invoiceNumber`/`receipts.receiptNumber` at the
  exact lines cited (682, 787), with the per-org unique constraints already in place. Current
  `repositories/invoices.ts` and `repositories/policyLogs.ts` indeed take no `orgId` anywhere yet,
  confirming the "before" state the plan works from. `CrossOrgReferenceError` already exists and
  is reused rather than invented. No `router.patch`/`router.put` exists anywhere under
  `backend/src/routes`, confirming the plan's "no update path in this domain" audit (finding #10)
  rather than asserting it blind.
- **`policyActivities.ts` cross-tenant gap is real and correctly scoped.** Read confirms the route
  today calls `listScheduledEmails({ policyId })` with zero org check — any authenticated user in
  any org can read another org's scheduled reminders by guessing a policy id. The plan's fix
  (resolve the policy via the already-org-scoped `findAutoPolicyById(orgId, policyId)` first, 404
  if missing, without pulling `listScheduledEmails` org-scoping into this issue) closes the hole
  precisely at the boundary #121 owns, which is the right call.
- **Directly continues #119** and reuses its established conventions (`orgId` first parameter,
  `CrossOrgReferenceError`, `ctx.org()`/`ctx.log()` fixtures with default-to-context-org pattern),
  consistent with `docs/multitenancy.md` rollout steps 4–5 and `PROJECT.md` roadmap item 2.
- **Applies the #119 review lesson correctly.** The plan explicitly re-derives (rather than
  assumes) that this half has no `.partial()` update body with a parent FK, and still instructs
  the implementer to re-check `routes/schemas.ts` and add the owned-row-repointed test if one turns
  up — the right level of caution given the issue calls this out by name.
- **Security posture is sound**: parent-FK checks on every insert (carrier-on-invoice-item), 404
  for missing/cross-org parents, `CrossOrgReferenceError` → 409 for a caller-supplied cross-org FK,
  storage-key prefixing that makes a cross-org confirm impossible, and trust-balance aggregates
  returning `0.00` instead of leaking another org's balance for a wrong-org id.
- **Tests are thorough and use `TestContext`/`ctx.org()`** per CLAUDE.md conventions: wrong-org case
  per route file, cross-org carrier rejection, independent per-org numbering, and — notably — a
  rollback-does-not-burn-a-number test, which is an easy case to skip and is called out with a
  concrete way to trigger it (numeric overflow inside the transaction).
- **Minor, non-blocking**: the plan flags its own open question about `paymentVoidedLogBody` still
  naming the payment by uid rather than a number (there is no per-payment number, so this is
  arguably not a gap at all) — reasonable to leave for the reviewer/implementer's judgment rather
  than a blocking issue.

## Required changes (if rejected)

None.

Verdict: approved
