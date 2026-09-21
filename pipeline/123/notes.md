---
issue: 123
status: complete
---
# Implementation notes — issue #123

## Implemented

- `frontend/src/api/auth.ts`: `User`/`Org`/`Membership`/`Me`/`Role` types
  mirroring the backend's `{ user, org, memberships }` payload; `User` no
  longer carries `role`. `toMe()` derives `role` once from
  `memberships.find(m => m.orgId === org?.id)`. `getMe`/`loginWithGoogle`
  return `Me`; added `selectOrg(orgId)` → `POST /auth/org`.
- `frontend/src/api/client.ts`: module-level `onOrgRequired` hook, fired from
  `request()`'s `!res.ok` branch on `403 { code: "ORG_REQUIRED" }`, before the
  throw — catches every caller (TanStack Query and plain `request()` calls
  alike), not just query-driven ones.
- `frontend/src/auth/AuthContext.tsx`: value is now
  `{ user, org, memberships, role, loading, setMe, setOrg }`. Registers the
  `ORG_REQUIRED` handler in an effect (clears `org`/`role`, navigates to
  `/select-org`); `setOrg(orgId)` calls `selectOrg` and stores the resulting
  `Me`.
- `frontend/src/auth/RequireAuth.tsx`: redirects to `/select-org` when
  `!org` (after the existing `!user` → `/login` check).
- `frontend/src/auth/RequireRole.tsx`: compares against `role` from
  `useAuth()` instead of `user.role`.
- `frontend/src/pages/Login.tsx` / `Logout.tsx`: use `setMe` instead of
  `setUser`; Login navigates to `/select-org` when the login response's
  `org` is `null`, otherwise `/home`.
- `frontend/src/pages/SelectOrg.tsx` (new): standalone route (sibling of
  `/login`, not under `RequireAuth`). Redirects `!user` → `/login`,
  `org` already set → `/home`, `memberships.length === 1` → `/home`
  (defensive; the backend auto-binds at login). Otherwise renders
  `OrgPicker`; on select, calls `setOrg`, clears the query cache, clears
  open client tabs (`saveTabs([])` directly — this route renders outside
  `ClientTabsProvider`, which only wraps `AppLayout`), then navigates home.
- `frontend/src/components/auth/org-picker.tsx` + `.stories.tsx` (new):
  presentational list of memberships; `Default` and `Pending` stories.
- `frontend/src/components/layout/org-switcher.tsx` (new): the sidebar
  header. One membership → static `NavLink` to `/home` (same as the old
  hardcoded "CloudMS" block, but with the org's name). More than one →
  the same button as a `DropdownMenu` trigger, one item per membership.
- `frontend/src/components/layout/app-sidebar.tsx`: replaced the hardcoded
  header with `OrgSwitcher`; added `orgName`/`memberships`/`activeOrgId`/
  `onSelectOrg` props (all optional with defaults, so existing stories
  didn't need to change). Added `SingleOrg`/`MultiOrg` stories.
- `frontend/src/components/layout/app-layout.tsx`: `AppLayoutInner` now
  reads `org`/`memberships`/`role`/`setOrg` from `useAuth()`, wires
  `OrgSwitcher` through `AppSidebar`, sets the document title via
  `useDocumentTitle`, and owns `handleSelectOrg` (calls `setOrg`, clears
  the query cache and open tabs, navigates to `/home`; shows an error
  toast and leaves the current org bound on failure).
- `frontend/src/components/layout/client-tabs.tsx`: added `clearTabs()`
  (`setTabs([])`) to `ClientTabsContext`; the existing persistence effect
  writes the empty array through to `localStorage`.
- `frontend/src/hooks/use-document-title.ts` (new): one-line
  `document.title` effect hook.
- `frontend/src/components/layout/user-menu.tsx`: takes `role` as its own
  prop instead of reading `user.role` (which no longer exists).
- `frontend/src/api/invoices.ts` / `payments.ts`: added `invoiceNumber` to
  `Invoice` (so also `InvoiceDetail`), `receiptNumber` to `InvoiceReceipt`
  and `ReceiptDetail`.
- Render sites switched from the opaque id to the per-org number:
  `lib/policy-ledger.ts` (invoice rows only — see *Deviations*),
  `invoice-payment-dialog.tsx` (invoice chooser, "Pay invoice #…" title,
  `SubmitResult.invoiceNumber` threaded through the create/pay paths, the
  partial-failure "Invoice #… was created" message),
  `invoice-receipt-dialog.tsx` (printable "Invoice #…" and "— Receipt #…").
- Fixtures/assertions updated in `policy-ledger.test.ts`,
  `invoice-payment-dialog.stories.tsx`, `invoice-receipt-dialog.stories.tsx`,
  `policy-ledger.stories.tsx` (all fixtures set `invoiceNumber`/
  `receiptNumber` equal to the row's `id`, matching the existing "Invoice
  #<id>" text assertions already in those files, so most needed no further
  change beyond adding the field).
- `docs/frontend-ui-design.md`: updated the `RequireAuth`/`RequireRole`/
  route-tree/`app-sidebar` bullets for the org-less redirect, the
  membership-derived role, `/select-org`, and the org switcher.
- `frontend.md`: added a short "Update" note under the response-shape
  section pointing at `docs/multitenancy.md`, left the rest of the
  (already-stale, historical) document alone.

## Decisions

- `AdminUser` (`api/users.ts`) previously inherited `role` for free via
  `extends User`. Now that `User` no longer carries `role`, `AdminUser`
  declares its own `role: 'admin' | 'staff'` — it's a different concept
  (the listed user's role on the admin's org, from their membership row,
  per `backend/src/routes/users.ts`'s `adminUser()`) from `Me.role` (the
  current session's own active-membership role), so this is a real field,
  not a leftover.
- `ClientDetail.tsx`'s `isAdmin={user?.role === 'admin'}` call sites
  (SendCorrespondenceDialog, InvoiceReceiptDialog) now read `role` from
  `useAuth()` directly, same as `app-layout.tsx`.

## Deviations from plan

- Ledger **payment** rows (`lib/policy-ledger.ts`'s `Payment #${payment.id}`,
  `invoice-receipt-dialog.tsx:162`'s `Payment #{payment.id}`) were left
  alone, per the plan's flagged risk: payments carry no per-org number, only
  invoices and receipts do. Not fixed here — the plan called this out as a
  choice for the reviewer, and coined two options (label by invoice, or add
  a backend field) both out of scope for a frontend-only issue.

## For the docs stage / reviewer

- The two-membership click-through described as unverifiable in the plan's
  risks was not set up (no throwaway script creating a second org/
  membership) — everything was verified through the Storybook/Vitest
  suite instead, which is what CI actually runs. If a manual click-through
  is wanted, it needs two orgs and a user with active memberships in both.
- `frontend.md` was intentionally left mostly frozen (a note added, not a
  rewrite) per the plan's risk about its status as a historical document.
- PROJECT.md's stale multi-tenancy *Current State*/*Deployment* text was
  left untouched, as scoped.

## Checks run

All from `frontend/`:

- `npm run lint` (oxlint) — clean, only pre-existing `only-export-components`
  fast-refresh warnings (present before this change too).
- `npm run build` (`tsc -b && vite build`) — passes.
- `npm test` (`vitest run`, Storybook stories under Vitest browser mode) —
  59 files / 334 tests, all passing. (Playwright's chromium/headless-shell
  browser had to be installed on this runner first via
  `npx playwright install --with-deps chromium`.)

No backend changes; no backend checks run.
