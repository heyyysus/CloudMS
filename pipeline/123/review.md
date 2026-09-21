# Plan review — issue #123

## Findings

- Scope matches the issue point-for-point: every one of the 9 numbered items in
  the issue has a corresponding section in the plan's Approach, and the "Out of
  scope" list mirrors the issue's own out-of-scope list (no backend change, no
  org-creation UI, no org-in-URL). No scope creep beyond the issue text.
- Dependency claims verified directly: `backend/src/auth/routes.ts` `meResponse()`
  does return `{ user, org, memberships }` with `role` derived from the active
  membership (routes.ts:29-37); `middleware.ts:56,64` answers
  `403 { error: "No active organization", code: "ORG_REQUIRED" }` exactly as
  claimed. `backend/src/db/schema.ts` has `invoiceNumber`/`receiptNumber` with
  per-org unique constraints (lines 682, 708, 787, 821), and `docs/API.md`
  documents both alongside `id` as the plan states. Both stated dependencies
  (sub-issues 3/9 and 6/9) are genuinely merged into what's on disk.
- Current frontend state matches the plan's "before" description exactly:
  `api/auth.ts`'s `User` still has `role`, `getMe`/`loginWithGoogle` return
  bare `User`; `AuthContext.tsx` only holds `user`/`loading`/`setUser`;
  `RequireAuth.tsx` only redirects to `/login`; `RequireRole.tsx` reads
  `user.role`; `app-sidebar.tsx` hardcodes the `CloudMS` label on a
  `SidebarMenuButton`; `client-tabs.tsx`'s context exposes no clear/reset
  method; `client.ts`'s `request()` already attaches the parsed body to
  `ApiError.body`, supporting the plan's `ORG_REQUIRED` detection approach
  without further plumbing.
- Invoice/receipt render-site line references spot-checked and correct or
  within a line or two: `policy-ledger.ts:67` (`Invoice #${invoice.id}`),
  `:106` (`Payment #${payment.id}`), `invoice-payment-dialog.tsx:175,535,686,827`
  and `invoice-receipt-dialog.tsx:162,369,416` all match the cited strings.
  The plan correctly identifies which of these become `invoiceNumber`/
  `receiptNumber` and which (bare payment ids, no per-org sequence) it
  deliberately leaves alone, flagging that gap rather than silently
  papering over it or scope-creeping into a backend change.
- Approach reuses existing conventions rather than inventing new ones: the
  switcher follows the `DropdownMenu`/`DropdownMenuTrigger asChild` pattern
  already in `user-menu.tsx`; the new `org-picker.tsx` follows the
  props-over-context convention from `docs/frontend-ui-design.md`; tests are
  added as Storybook stories under Vitest browser mode, this codebase's
  established pattern (PROJECT.md confirms Storybook stories double as the
  test suite for frontend), not backend `TestContext` (correctly N/A — this
  issue touches no backend code, and the plan says so explicitly).
- No security concern: no new backend surface, no session/auth logic
  reimplemented client-side (the `ORG_REQUIRED` redirect is UX only; the
  actual multi-tenant enforcement stays server-side per
  `docs/multitenancy.md`), no secrets touched. `clearTabs()`/query-cache
  clearing on org switch is the right call to stop one org's local/cache
  state from leaking into another's view.
- Direction lines up with PROJECT.md item 2 (multi-tenant rollout) and
  correctly identifies this as the final, frontend-only piece of that series;
  it does not attempt to fix PROJECT.md's stale *Current State*/*Deployment*
  text, correctly deferring that to the end of the multi-tenant series rather
  than doing it piecemeal here.
- The plan is appropriately self-critical: it surfaces genuine open
  judgment calls (unlabeled payment rows, whether to touch `frontend.md`,
  `user.role` vs. derived `role` as source of truth) as flagged risks with
  recommended defaults, rather than either silently picking one or declaring
  the issue too vague — exactly the calibration this review is supposed to
  check for.
- No CLAUDE.md violations found for the parts of CLAUDE.md that apply to a
  frontend-only change (the multi-tenancy repository/`orgId`/`adminDb` rules
  are backend-specific and out of scope here; the concurrent-agents section is
  explicitly excluded from this review per instructions).

## Required changes (if rejected)

N/A — no rejection.

Verdict: approved
