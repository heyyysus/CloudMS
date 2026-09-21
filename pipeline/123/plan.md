---
issue: 123
status: pending-review
---
# Frontend org context: picker, sidebar switcher, tab title, invoice/receipt numbers

## Goal

The frontend stops assuming one organization. Done means:

- `api/auth.ts` mirrors the `{ user, org, memberships }` payload the backend
  already returns from `/auth/google`, `/auth/me` and `/auth/org`, and exposes
  `selectOrg(orgId)` → `POST /auth/org`.
- `AuthContext` holds `user`, `org`, `memberships`, `role` and `setOrg`; a `403`
  carrying `code: "ORG_REQUIRED"` from any API call sends the user to
  `/select-org`.
- `/select-org` exists: a list of the user's orgs, one click binds the session
  and lands on `/home`. A single-membership user never sees it (the backend
  auto-binds at login) and is redirected straight through.
- `RequireAuth` sends a sessionless visitor to `/login` and an org-less session
  to `/select-org`.
- The sidebar header shows the active org's name, and becomes a switcher when
  the user has more than one membership: selecting an org calls `selectOrg`,
  clears the TanStack Query cache, clears the open client tabs, and navigates
  to `/home`.
- The document title is `<org name> · CloudMS` while an org is active and
  `CloudMS` otherwise.
- Every place the UI prints an invoice or receipt identifier uses the per-org
  `invoiceNumber` / `receiptNumber` instead of the opaque row `id`. `id` stays
  in URLs, props and query keys.
- `npm run lint`, `npm run build` and `npm test` are green in `frontend/`.

The issue is specific enough to plan concretely. Two details it does not settle
are called out under *Risks / open questions*: how ledger **payment** rows
should be labelled (payments have no per-org number, only receipts do), and
whether `frontend.md` should be edited at all given what that file actually is.

## Scope check

PROJECT.md *Direction* item 2 ("make the app multitenant so it can be released
to more than one agency"), and the last step of the rollout order in
`docs/multitenancy.md` — this is the only frontend-facing piece of the
multi-tenant series.

Both stated dependencies are merged into `main` and verified in the tree:

- Sub-issue 3/9 — `backend/src/auth/routes.ts` has `meResponse()` returning
  `{ user, org, memberships }` from all three auth routes, plus
  `POST /auth/org`; `backend/src/auth/middleware.ts` `requireAuth` answers
  `403 { error: "No active organization", code: "ORG_REQUIRED" }`.
- Sub-issue 6/9 — `invoices.invoice_number` and `receipts.receipt_number` exist
  in `backend/src/db/schema.ts` with per-org unique constraints, and
  `docs/API.md` (≈lines 609, 647) documents both as integers alongside the
  opaque `id`.

Issue #130 (opaque string ids) is also merged — every id in `frontend/src/api/`
is already `string`, so no id-type work falls out of this issue.

Triage labels look right: `enhancement`, `area:frontend`. Two notes: the work
also touches two markdown docs (an `area:docs` label would be fair, and the
label set undersells the blast radius — this rewrites the auth context that
`Login`, `Logout`, `RequireAuth`, `RequireRole`, `AppLayout`, `UserMenu` and
`ClientDetail` all read); and PROJECT.md's *Current State* still claims
"Multi-tenancy is designed but not built … no `organizations` table", which is
stale against `main` but out of this issue's scope (see *Out of scope*).

## Files / areas

New:

- `frontend/src/pages/SelectOrg.tsx` — the `/select-org` route.
- `frontend/src/components/auth/org-picker.tsx` — presentational list of orgs
  (`memberships`, `onSelect`, `pending`), so it renders standalone in a story
  per the props-over-context rule in `docs/frontend-ui-design.md`.
- `frontend/src/components/auth/org-picker.stories.tsx`.
- `frontend/src/components/layout/org-switcher.tsx` — sidebar header block:
  org name, and a `DropdownMenu` when `memberships.length > 1`.
- `frontend/src/hooks/use-document-title.ts` — small effect hook.

Changed:

- `frontend/src/api/auth.ts` — `Me`/`Org`/`Membership` types, `User` loses
  `role`, `getMe`/`loginWithGoogle` return `Me`, new `selectOrg`.
- `frontend/src/api/client.ts` — an `ORG_REQUIRED` hook (below).
- `frontend/src/auth/AuthContext.tsx` — new value shape.
- `frontend/src/auth/RequireAuth.tsx` — second redirect.
- `frontend/src/auth/RequireRole.tsx` — read `role` from context, not `user`.
- `frontend/src/pages/Login.tsx`, `frontend/src/pages/Logout.tsx` — call sites
  of the renamed setter.
- `frontend/src/App.tsx` — `/select-org` route.
- `frontend/src/components/layout/app-sidebar.tsx` + `.stories.tsx` — header.
- `frontend/src/components/layout/app-layout.tsx` — wire the switcher, pass
  `role` to `UserMenu`, set the document title.
- `frontend/src/components/layout/user-menu.tsx` + `.stories.tsx` — `role` prop.
- `frontend/src/components/layout/client-tabs.tsx` — add `clearTabs`.
- `frontend/src/api/invoices.ts`, `frontend/src/api/payments.ts` — add the
  number fields.
- `frontend/src/lib/policy-ledger.ts` + `.test.ts`.
- `frontend/src/components/clients/invoice-payment-dialog.tsx` + `.stories.tsx`.
- `frontend/src/components/clients/invoice-receipt-dialog.tsx` + `.stories.tsx`.
- `frontend/src/components/clients/policy-ledger.tsx` (header comment) +
  `.stories.tsx`.
- `docs/frontend-ui-design.md`, `frontend.md`.

## Approach

### 1. `api/auth.ts`

Mirror the server shapes exactly as `meResponse()` builds them:

```ts
export interface User { id: string; email: string; name: string | null }
export interface Org { id: string; name: string; slug: string }
export interface Membership {
  orgId: string; name: string; slug: string; role: 'admin' | 'staff'
}
export type Role = Membership['role']
export interface Me {
  user: User
  org: Org | null
  memberships: Membership[]
  role: Role | null   // derived; see below
}
```

`listActiveMembershipsWithOrg` returns `{ orgId, name, slug, role }` — there is
no membership `id` on the wire, so `orgId` is the list key.

The server already computes the active role and sends it as `user.role` (it is
`null` when no org is bound). Rather than trusting two sources, parse the
response and derive `role` once in one `toMe(payload)` helper:
`memberships.find(m => m.orgId === org?.id)?.role ?? null`. That keeps `User`
free of `role` as the issue asks, and keeps the frontend correct even if
`user.role` is later dropped server-side.

`loginWithGoogle` and `getMe` return `Promise<Me>` via `toMe`; add
`selectOrg(orgId: string): Promise<Me>` → `POST /auth/org` with
`{ orgId }`, same helper.

### 2. `ORG_REQUIRED` interception

`request()` in `api/client.ts` already attaches the parsed error body to
`ApiError.body`, so the detection is
`err.status === 403 && (err.body as { code?: string })?.code === 'ORG_REQUIRED'`.

Register the reaction at the transport, not in TanStack Query: plain calls
(`recordPayment` inside the invoice dialog's `mutationFn`, the VIN decoder,
etc.) go through `request` too, and a `QueryCache.onError` would miss them. Add
a module-level hook to `client.ts`:

```ts
let onOrgRequired: (() => void) | null = null
export function setOrgRequiredHandler(fn: (() => void) | null) { onOrgRequired = fn }
```

called from the `!res.ok` branch just before the `throw`. `AuthProvider`
registers it in an effect (and clears it on unmount). The handler clears `org`
in context and navigates to `/select-org` — `AuthProvider` sits inside
`BrowserRouter` in `App.tsx`, so `useNavigate()` is available there.

### 3. `AuthContext`

Value becomes `{ user, org, memberships, role, loading, setMe, setOrg }`.

- `setMe(me: Me | null)` replaces today's `setUser` — the two call sites are
  `Login.tsx` (`setMe(me)`) and `Logout.tsx` (`setMe(null)`).
- `setOrg(orgId: string): Promise<void>` calls `selectOrg(orgId)` and stores the
  returned `Me`. It only touches auth state; cache/tab/navigation side effects
  belong to the caller (the switcher and the picker), so the context stays
  renderable without a `QueryClient`.
- The mount effect is unchanged apart from storing the whole `Me`.

### 4. Routing

- `/select-org` is a standalone route next to `/login` (it must be reachable
  *without* an org, so it cannot sit under `RequireAuth`). The page itself
  redirects: no `user` → `/login`; `org` already set → `/home`; otherwise
  render `OrgPicker` with `memberships`. `memberships.length === 1` also
  redirects (backend auto-binds at login; the branch is defensive, and matches
  the issue's "this page just redirects").
- `RequireAuth` keeps the loader while `loading`, then `!user` → `/login`,
  `!org` → `/select-org`, else `<Outlet />`.
- `RequireRole` compares `role` from `useAuth()` against its `role` prop. Its
  type changes from `User['role']` to the exported `Role`.
- `Login.tsx` navigates to `/select-org` when the login response has
  `org === null`, otherwise `/home` (`RequireAuth` is the backstop either way).
  Its `if (user) return <Navigate to="/home" />` early return stays.

### 5. Sidebar switcher

`OrgSwitcher` takes `orgName: string | null`, `memberships: Membership[]`,
`activeOrgId: string | null`, `onSelectOrg: (orgId: string) => void`. With one
membership it renders the existing `SidebarMenuButton size="lg"` block with the
`Cloud` icon, swapping the hardcoded `CloudMS` label for the org name; with
more than one it wraps the same button in `DropdownMenu` /
`DropdownMenuTrigger asChild` (`@/components/ui/dropdown-menu` is already
vendored — see `user-menu.tsx` for the pattern) with one
`DropdownMenuCheckboxItem`/`DropdownMenuItem` per membership and a
`ChevronsUpDown` trailing icon. `AppSidebar` gains the same props and passes
them through; keep them optional with defaults so existing stories still
compile.

`AppLayoutInner` owns the side effects, since it already has `useAuth`,
`useClientTabs` and `useNavigate`:

```ts
async function handleSelectOrg(orgId: string) {
  if (orgId === org?.id) return
  await setOrg(orgId)
  queryClient.clear()   // via useQueryClient()
  clearTabs()
  navigate('/home')
}
```

`clearTabs()` is a new member of `ClientTabsContext`: `setTabs([])`. The
existing `useEffect` in `ClientTabsProvider` persists `tabs` on every change, so
that also wipes `cloudms.open-client-tabs` in `localStorage` — necessary, since
otherwise the previous org's tabs return on reload and their `/clients/:id`
links 404 under the new org. Surface an error toast (`components/ui/toast`) if
`setOrg` rejects, and leave the current org bound.

The `/select-org` page performs the same cache/tab clear before navigating to
`/home`, for the case where a user switches after having browsed another org in
the same tab.

### 6. Document title

`useDocumentTitle(title: string)` — a one-line effect setting `document.title`.
Call it from `AppLayoutInner` with `org ? `${org.name} · CloudMS` : 'CloudMS'`,
so unauthenticated routes keep the static `CloudMS` from `index.html`. Leave
`frontend/index.html` alone.

### 7. Invoice and receipt numbers

Types first: `Invoice` gains `invoiceNumber: number` (inherited by
`InvoiceDetail`), `InvoiceReceipt` and `payments.ts`'s `ReceiptDetail` gain
`receiptNumber: number`. Both are already on the wire per `docs/API.md`.

Then the render sites, all of which currently interpolate an id:

- `lib/policy-ledger.ts:67,84` — `Invoice #${invoice.invoiceNumber}`. Update
  the fixtures and the `reference: 'Invoice #1'` expectation in
  `lib/policy-ledger.test.ts`.
- `lib/policy-ledger.ts:106,123` — `Payment #${payment.id}`. See *Risks*; the
  recommendation is to leave the payment rows' label out of this issue's change
  and raise it separately, since `InvoicePayment` carries no number field.
- `components/clients/policy-ledger.tsx:14` — the header comment's example.
- `components/clients/invoice-payment-dialog.tsx:175` (open-invoice chooser),
  `:535` (`Pay invoice #…` title), `:686` (`ResultSummary` title) and `:827`
  (the partial-failure `Invoice #… was created` message). `SubmitResult` gains
  `invoiceNumber: number | null` alongside `invoiceId`, filled from
  `created.invoiceNumber` on the create path and from the looked-up
  `targetInvoice` on the pay path; `invoiceId` stays, it is what the query
  invalidation keys off.
- `components/clients/invoice-receipt-dialog.tsx:369` (`Invoice #…` on the
  printable summary), `:416` (`— Receipt #${receipt.receiptNumber}`), and
  `:162`'s `Payment #{payment.id}` under the same caveat as the ledger.

Update the assertions and fixtures in `invoice-payment-dialog.stories.tsx`,
`invoice-receipt-dialog.stories.tsx` and `policy-ledger.stories.tsx` to carry
the new fields and assert on numbers. Nothing changes for
`policy-attachments.stories.tsx` — those `Receipt #00001.pdf` filenames are
generated server-side by `formatDocumentNumber` and already use the per-org
number.

### 8. Docs

- `docs/frontend-ui-design.md` — extend the `RequireAuth` bullet (≈line 33) with
  the org-less → `/select-org` redirect, the `RequireRole` bullet (≈line 35) to
  say the role comes from the active membership, the route-tree bullet (≈line
  36) with `/select-org`, and the `app-sidebar` bullet (≈line 37) with the org
  header/switcher.
- `frontend.md` — this file is the original build plan for the auth task, not
  living documentation (it still describes `id: number` and a bare Vite
  scaffold). Add a short note under its response-shape section recording that
  `/auth/*` now returns `{ user, org, memberships }` and pointing at
  `docs/multitenancy.md`, rather than rewriting the document. See *Risks*.

## Tests

Frontend only — Storybook stories run as the test suite under Vitest browser
mode (`npm test` → `vitest run`).

Add:

- `org-picker.stories.tsx` — Default (two orgs, `play` asserts both names
  render and a click fires `onSelect` with the right `orgId`) and a pending
  state. `MemoryRouter` decorator; no `AuthProvider`, no `getMe()`.
- `app-sidebar.stories.tsx` — `SingleOrg` (org name shown, no dropdown trigger)
  and `MultiOrg` (`play`: open the dropdown via `userEvent`, assert both org
  names, click the inactive one, assert `onSelectOrg` was called with its
  `orgId`). Follow the existing `AdminCollapsed` story's `userEvent`/`within`
  style; Radix portals render outside `canvasElement`, so assert on
  `screen`/`within(document.body)` as `invoice-receipt-dialog.stories.tsx`
  already does.
- `user-menu.stories.tsx` — a `role` arg.

Update: the invoice/receipt/ledger stories listed above, and
`lib/policy-ledger.test.ts`.

Run in `frontend/`: `npm run lint`, `npm run build` (this is `tsc -b` plus
Vite, and will catch every `User['role']` / `getMe()` call site the refactor
misses), `npm test`. Note that CI only runs lint + build for the frontend
(PROJECT.md names this gap), so `npm test` must be run locally before the PR.

No backend tests to run or add.

## Touches backend

No.

## Risks / open questions

- **Ledger payment rows have no number.** `payments` has no per-org sequence —
  only `invoices` and `receipts` do — so `Payment #${payment.id}` in
  `lib/policy-ledger.ts` and `invoice-receipt-dialog.tsx:162` would print a
  22-char opaque id to staff. The issue only mandates invoice and receipt
  numbers, so the plan leaves those two strings alone. Options if the reviewer
  wants it settled here: label the row by the invoice it credits ("Payment on
  Invoice #12"), or plumb the payment's receipt number through the
  `GET /payments?policyId=` shape (a backend change, and therefore out of
  scope). Flagging rather than choosing.
- **`user.role` on the wire.** The backend still sends a derived `role` on the
  `user` object. This plan derives `role` from `memberships` instead and drops
  it from the frontend `User` type, as the issue asks. If a reviewer prefers
  reading the server's field directly, that is a one-line change in `toMe` —
  but the two must not both be treated as sources of truth.
- **`clearTabs` and multi-tab browsers.** `ClientTabsProvider` listens for
  `storage` events, so clearing tabs in one browser tab clears them in the
  others — correct here (the session's org is shared across them), but worth
  knowing it is a cross-tab effect.
- **`frontend.md`'s status.** It reads as a completed task's design doc rather
  than maintained documentation. The issue asks for it to "mention the org
  context"; the plan adds a pointer note. If the reviewer would rather it be
  left frozen as a historical record, drop that edit — nothing depends on it.
- **PROJECT.md is stale.** Its *Current State* still says multi-tenancy is not
  built and its *Deployment* section says "the schema has no organization yet".
  Not this issue's scope, but the multi-tenant series should not close without
  a PROJECT.md refresh.
- **Nothing here can be verified end-to-end without a seeded second org.** The
  acceptance criteria describe a two-membership user; the stories cover the
  components, but a real click-through needs two orgs and a user with
  memberships in both in the local database. Create them through
  `runInOrg`/repository calls in a throwaway script, not `db:seed`.

## Out of scope

- Any backend change — including adding a payment number, or changing what
  `GET /payments` returns.
- Org creation, invite-a-new-org, or organization settings UI.
- Putting the org in the URL (`/o/:slug/...`); the session stays the only
  source of the active org.
- The demo-org banner described in `docs/multitenancy.md`.
- Refreshing PROJECT.md's *Current State* / *Deployment* sections.
- Wiring the frontend Vitest suite into CI (PROJECT.md direction item 1).
