---
issue: 100
status: pending-review
---
# Demo mode in the frontend: config on boot, name-prompt sign-in, banner, disabled affordances

## Goal

The frontend learns from the server whether it is running as a public demo and
adapts itself accordingly. "Done" means:

1. The app fetches `GET /api/v1/config` once on boot and exposes `demoMode` (and
   whatever reset interval the endpoint exposes) to the whole tree, `/login`
   included.
2. `/login` in demo mode shows a single "display name" field and an **Enter
   demo** button that `POST`s to `/auth/demo` and lands the user on `/home`. The
   Google Sign-In button is not rendered and the Google GSI script is never
   injected.
3. A persistent banner reading "Demo — all data is fake and resets every N
   minutes" is visible on both the sign-in screen and every authenticated
   screen.
4. Email-sending and attachment-upload affordances are visibly disabled in demo
   mode (Send correspondence, Add attachment, drag-and-drop file attach), and if
   a request reaches the server anyway and comes back `403 "disabled in demo
   mode"`, the user gets a toast — never a blank/error screen.
5. When `demoMode` is false — including when `/api/v1/config` is missing
   entirely, because the foundation issue has not merged yet — the app behaves
   exactly as it does today. This property is what makes this PR safe to merge
   independently of its dependency.

**Dependency.** This is the frontend half of demo mode. `GET /api/v1/config` and
`POST /auth/demo` come from the foundation issue and **do not exist in this repo
today** (`grep -rin demo backend/src` finds nothing related). The plan below
therefore states the response shapes it assumes; the coder must check the merged
foundation PR first and adapt the two thin files in `frontend/src/api/` if the
real shapes differ. Nothing else in the plan depends on those details.

## Scope check

PROJECT.md's Direction list does not mention a demo mode, so this is
infrastructure for showing the product rather than a numbered roadmap item —
legitimate but worth naming. It touches the two pillars that *are* built out
(the "Fully cloud-based" pillar's sign-in story, and the automated-email surface
that shipped since PROJECT.md was last written) without changing either
pillar's behaviour outside demo mode.

Triage labels look right: `enhancement`, `area:frontend`. There is deliberately
no `area:backend` — see **Touches backend**. Note that PROJECT.md's "Current
State" section is out of date relative to the code this issue touches: it does
not mention correspondence sending, reminder rules/scheduled emails, or policy
attachments with presigned R2 uploads, all of which exist under
`frontend/src/api/` and `backend/src/routes/`. Do not "fix" PROJECT.md in this
PR; the docs stage can decide.

## Files / areas

Add:

- `frontend/src/api/config.ts` — `AppConfig` type and `getConfig()`.
- `frontend/src/config/AppConfigContext.tsx` — `AppConfigProvider`,
  `useAppConfig()`. Mirrors `frontend/src/auth/AuthContext.tsx` exactly.
- `frontend/src/components/layout/demo-banner.tsx` +
  `demo-banner.stories.tsx` — the banner.
- `frontend/src/components/auth/demo-sign-in-form.tsx` +
  `demo-sign-in-form.stories.tsx` — the name prompt, with an injectable
  `signInFn` so it is storybook-testable (pages are not).
- `frontend/src/components/auth/google-sign-in-panel.tsx` — today's Google block
  lifted out of `Login.tsx` verbatim (see Approach step 3 for why this is not
  optional).
- `frontend/src/lib/demo.ts` + `frontend/src/lib/demo.test.ts` —
  `isDemoDisabledError(err)` and `demoBannerText(resetMinutes)`; pure helpers,
  covered by the `unit` vitest project (`src/**/*.test.ts`).

Change:

- `frontend/src/api/auth.ts` — add `loginAsDemoUser(name)`.
- `frontend/src/App.tsx` — mount `AppConfigProvider`.
- `frontend/src/pages/Login.tsx` — branch between the two sign-in panels; render
  the banner.
- `frontend/src/components/layout/app-layout.tsx` — render the banner.
- `frontend/src/pages/ClientDetail.tsx` — pass the demo flag down; gate the
  file-drop handler.
- `frontend/src/components/clients/send-correspondence-dialog.tsx` — accept
  `disabled`.
- `frontend/src/components/clients/policy-attachments.tsx` — accept
  `uploadDisabled`.
- `frontend/src/components/clients/add-attachment-dialog.tsx`,
  `send-correspondence-dialog.tsx` — friendlier copy on a demo-disabled 403.
- The `.stories.tsx` files for the two components above.

Do not change: any file under `backend/`, `frontend/src/api/client.ts`,
`frontend/src/lib/query-client.ts`, `frontend/src/auth/AuthContext.tsx`,
`RequireAuth.tsx`, or `frontend/src/components/ui/*`.

## Approach

**1. The config API module.** `frontend/src/api/config.ts`, in the style of
`api/auth.ts`:

```ts
import { request } from './client'

export interface AppConfig {
  demoMode: boolean
  // Minutes between demo resets, when the server exposes it. Absent means the
  // banner falls back to static copy rather than inventing a number.
  demoResetMinutes?: number
}

export function getConfig(signal?: AbortSignal): Promise<AppConfig> {
  return request('/config', { signal })
}
```

`request()` already prefixes `/api/v1`, so the path here is `/config`. Same for
`/auth/demo` in step 2 — the issue writes the endpoints with and without the
prefix, but both go through `request()`.

**2. `loginAsDemoUser`.** In `frontend/src/api/auth.ts`, alongside
`loginWithGoogle`, assuming `/auth/demo` answers with the same `{ user }`
envelope the other two auth endpoints use:

```ts
export function loginAsDemoUser(name: string): Promise<User> {
  return request<{ user: User }>('/auth/demo', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((data) => data.user)
}
```

**3. `AppConfigProvider`.** Copy the shape of `AuthContext.tsx` — `useState` +
one `useEffect` + a `loading` flag + a `useAppConfig()` hook that throws outside
the provider. Two rules specific to this one:

- **Fail open to `{ demoMode: false }`.** `.catch(() => setConfig({ demoMode:
  false }))`. A 404 (foundation not merged), a 500, or an offline boot must all
  leave production behaving exactly as today. This is goal 5 and it is the
  single most important line in the file.
- Expose `loading` so `/login` can hold off painting until it knows which panel
  to show.

Mount it in `App.tsx` between `BrowserRouter` and `AuthProvider`:

```tsx
<BrowserRouter>
  <AppConfigProvider>
    <AuthProvider>
```

Inside `ToastProvider` so demo toasts work, outside `AuthProvider` so the login
screen and the app shell read the same value.

**4. Split the Login panels.** `useGoogleSignIn` is a hook, so it cannot be
called conditionally, and it has two side effects that must not happen in a demo
deployment: it appends the `accounts.google.com/gsi/client` script to
`document.head`, and when `VITE_GOOGLE_CLIENT_ID` is unset (very likely on a
demo host) it sets an error string that today's `Login.tsx` renders as
"Google sign-in is not configured". Both are wrong on a demo login screen. So:

- Move lines 35 and 47-55 of `pages/Login.tsx` (the `useGoogleSignIn` call, the
  `buttonRef` div, and the `scriptError` paragraph) into
  `components/auth/google-sign-in-panel.tsx`. It takes
  `onCredential: (idToken: string) => void` and `signInError: string | null` and
  renders exactly what is there now. This is a pure lift — no behaviour change.
- `Login.tsx` becomes: `const { config, loading: configLoading } = useAppConfig()`;
  keep `if (loading || configLoading) return null` and `if (user) return
  <Navigate to="/home" replace />`; then render
  `{config.demoMode ? <DemoSignInForm onSignedIn={…} /> : <GoogleSignInPanel … />}`
  inside the existing `Card`, with the `CardTitle`/`CardDescription` switched to
  demo copy ("Enter the demo" / "Pick a display name — no account needed.").
- Wrap the card in a `flex min-h-svh flex-col` container so
  `<DemoBanner />` can sit above it (see step 6).

**5. `DemoSignInForm`.** react-hook-form + zod, the pattern every dialog in
`components/clients/` uses (`add-attachment-dialog.tsx` is the closest small
example): `z.object({ name: z.string().trim().min(1, 'Enter a name').max(80) })`,
`useForm` with `zodResolver`, `Field`/`FieldLabel`/`FieldError` from
`components/ui/field.tsx`, and `SubmitButton` with `pendingLabel="Entering…"`.

Take an injectable `signInFn = loginAsDemoUser` prop — the codebase's
established seam for storybook tests (`sendFn` in `send-correspondence-dialog.tsx`,
`presignFn`/`confirmFn` in `add-attachment-dialog.tsx`) — and an
`onSignedIn(user)` callback so the page owns `setUser` + `navigate('/home')`.
Reuse `Login.tsx`'s existing `errorMessage(err)` helper for the failure copy,
extending it for the codes `/auth/demo` can realistically return (429 "The demo
is busy right now — try again in a moment.", 503 "The demo is unavailable right
now."); the default "Sign-in failed. Please try again." covers the rest.

**6. The banner.** `demo-banner.tsx` renders `null` when `demoMode` is false, so
call sites stay one line:

```tsx
<div role="status" className="flex h-8 shrink-0 items-center justify-center
  bg-warning/20 px-4 text-center text-xs font-medium text-foreground">
  {demoBannerText(config.demoResetMinutes)}
</div>
```

`--color-warning` is already a theme token (`index.css:29`, light and dark), so
this needs no new CSS. `demoBannerText` lives in `lib/demo.ts` and is the piece
worth unit-testing:

```ts
export function demoBannerText(resetMinutes?: number): string {
  if (!resetMinutes || resetMinutes <= 0) return 'Demo — all data is fake and resets periodically.'
  return `Demo — all data is fake and resets every ${resetMinutes} minute${resetMinutes === 1 ? '' : 's'}.`
}
```

**Placement matters, and the obvious placement is wrong.** Do *not* put the
banner above `<Routes>` in `App.tsx`. The sidebar is `fixed inset-y-0 h-svh`
(`components/ui/sidebar.tsx:230`) and the shell wrapper is `min-h-svh`
(`:138`), so an in-flow bar at the top of the document gets overlapped by the
sidebar and pushes the page into a permanent 32px scroll. Render it in two
places instead, both of which are plain flex columns:

- `app-layout.tsx`: as the first child of `<SidebarInset>`, immediately above
  the `<header className="flex h-14 …">`. It then spans the content column only,
  which is the correct visual result, and needs no height math.
- `pages/Login.tsx`: at the top of the new `flex min-h-svh flex-col` wrapper.

Optionally also `pages/Logout.tsx` (same trivial wrapper); harmless either way,
mention what you chose in `notes.md`.

One known interaction to eyeball in the browser: the toast viewport is
`fixed top-4` and deliberately overlaps the header (`toast.tsx:161-168`). With
the banner present a toast will overlap the banner instead. That is acceptable —
do not restyle the viewport for it — but confirm the banner is still readable
while a toast is up.

**7. Disable the email and upload affordances.** Keep the demo check in the
*pages*, and pass a plain boolean prop down, matching how `isAdmin` and
`currentUserId` already flow from `ClientDetail`/`AppLayout` into these
components. Components stay pure and their stories set the prop directly —
do not call `useAppConfig()` inside `components/clients/*`, or every existing
story in those files needs a new provider wrapper.

In `pages/ClientDetail.tsx`, `const { config } = useAppConfig()`, then:

- `<SendCorrespondenceDialog … disabled={config.demoMode} />` (line 313). Inside
  the dialog, thread `disabled` onto the `<Button variant="outline" size="sm">`
  in the `DialogTrigger` (line 171-175) and add `title="Disabled in the demo"`.
  Do **not** wrap it in a `Tooltip` — a `disabled` button emits no pointer
  events, so a Radix tooltip trigger would need an extra focusable span wrapper;
  the native `title` is the right amount of machinery here.
- `<PolicyAttachments … uploadDisabled={config.demoMode} />` (line 346). In
  `policy-attachments.tsx`, `disabled` on the "Add attachment" button
  (`:137`) and swap the empty-state copy at `:154` — it currently reads
  'No attachments yet. Drop a file anywhere on this page, or use "Add
  attachment".', which invites an interaction that will not work. In demo mode
  it should read "No attachments yet. Uploads are disabled in the demo."
- The `useFileDrop` handler (`:146-158`): in demo mode a rater file still opens
  `ImportQuoteDialog` — that parses locally via `parseIntegrationFile` and only
  POSTs JSON (`import-quote-dialog.tsx:257-263`), so it is not an upload and
  should keep working, which also keeps the demo's best party trick. The
  non-rater branch (`openAttachmentDialog(file)`) must instead fire
  `toast.info('Uploading files is disabled in the demo.')` and return.

Leave alone: correspondence/email template CRUD, reminder-rule CRUD, and
`cancelScheduledEmail`. The first two write rows rather than send mail, and
cancelling a scheduled email *prevents* a send. There is no "run reminder tick"
button in the UI today (`runReminderTick` in `api/reminders.ts` has no caller),
so nothing to gate there.

**8. The 403 fallback.** Both flows already toast on failure —
`add-attachment-dialog.tsx:213` and `send-correspondence-dialog.tsx:160` are
`onError: (error) => toast.error(error.message)` — so a 403 today is already a
toast, not an error page, and `ApiError.message` is already the server's `error`
string. The remaining work is copy: add to `lib/demo.ts`

```ts
export function isDemoDisabledError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && /demo mode/i.test(err.message)
}
```

and in both `onError` handlers use
`toast.error(isDemoDisabledError(error) ? 'This action is disabled in the demo.' : error.message)`.
If the foundation PR returns a machine-readable code in the body (e.g.
`{ error, code: 'demo_disabled' }`), prefer checking `err.body` over the regex —
`ApiError.body` exists for exactly this (`api/client.ts:6-8`). Check before
coding.

A global `MutationCache.onError` in `createQueryClient` was considered and
rejected: `App` creates the query client but is rendered *outside* its own
`ToastProvider`, so `useToast()` is not reachable there without reordering the
providers. Not worth it for two call sites.

## Tests

Frontend only. From `frontend/`:

- `npm run lint` (oxlint), `npx tsc -b`, `npm run build`.
- `npx vitest run` — runs both projects; the `unit` project picks up
  `src/lib/demo.test.ts`, the `storybook` project runs the stories in real
  Chromium.

New stories:

- `demo-banner.stories.tsx` — with and without `resetMinutes`; assert the
  rendered copy and that the `resetMinutes`-absent case says "periodically".
- `demo-sign-in-form.stories.tsx` — the important one, since `/login` itself has
  no story: (a) type a name, submit, `await expect(args.signInFn).toHaveBeenCalledWith('Ada')`
  and `onSignedIn` fired; (b) submit empty, expect the zod message and
  `signInFn` **not** called; (c) `signInFn` rejects with
  `new ApiError(429, '…')`, expect the mapped copy. Model these on
  `send-correspondence-dialog.stories.tsx`, which already does exactly this
  shape of play function.

Updated stories:

- `policy-attachments.stories.tsx` — add a story with `uploadDisabled: true`
  asserting `getByRole('button', { name: 'Add attachment' })` is disabled, and
  that the demo empty-state copy renders. The existing story at `:196` asserting
  the button is present must still pass untouched.
- `send-correspondence-dialog.stories.tsx` — add a `disabled: true` story
  asserting the `Send` trigger is disabled and the dialog does not open on
  click. All existing stories must pass unchanged; if one needs an edit, the
  `disabled` prop leaked into non-demo behaviour.

Unit tests in `src/lib/demo.test.ts`: `demoBannerText` for `undefined` / `0` /
`1` (singular "minute") / `30`, and `isDemoDisabledError` for a matching 403, a
403 with unrelated copy, a 500, and a non-`ApiError` value.

Manual check, since none of the above exercises the boot path: with the backend
running, `curl -i localhost:8000/config` returns 404 today — confirm the app
still loads, still shows the Google button, and shows no banner. That is the
regression that matters most.

## Touches backend

No. Every file listed above is under `frontend/`. The two endpoints belong to
the foundation issue; if the coder finds them missing, that is expected —
implement against the assumed shapes and note it in `notes.md`.

## Risks / open questions

- **The dependency may not be merged.** Highest-probability snag. The fail-open
  `catch` in step 3 is what keeps that from being a blocker: without
  `/api/v1/config` the app is byte-for-byte today's behaviour plus one 404 in
  the network tab. If the reviewer would rather block, say so — but merging
  first is safe.
- **Response shape is guessed.** `demoMode`, `demoResetMinutes`, and the
  `{ user }` envelope from `/auth/demo` are all assumptions. Read the foundation
  PR before writing `api/config.ts`. If the reset interval is not exposed,
  `demoBannerText` already degrades to static copy — that is the "else static
  copy" the issue allows, not a gap.
- **Hide vs. disable.** This plan disables (greyed control + `title`) rather than
  hides, so the demo still shows that the product *has* correspondence and
  attachments. The issue says "hide or disable" and leaves the call to us;
  flagging it because it is the most reviewable judgement here and is a one-line
  change either way.
- **Demo user role.** If `/auth/demo` mints an `admin`, the sidebar exposes
  `/admin/*` (`app-layout.tsx:56`) including user management and trust
  accounting. Probably fine for a demo and it is the foundation issue's call,
  but worth a look at what the endpoint returns — this plan does not gate any
  admin route.
- **`Login.tsx` refactor risk.** Extracting `GoogleSignInPanel` touches the one
  screen with no test coverage at all. Keep it a literal move and verify the
  non-demo login still renders a Google button against a real backend.
- **Banner + fixed sidebar.** Called out in step 6 because the natural
  implementation is subtly broken. If a single top-of-document banner is
  preferred over two call sites, it needs `min-h-svh` → `min-h-[calc(100svh-2rem)]`
  edits in `sidebar.tsx`, `Login.tsx`, `Logout.tsx` and `RequireAuth.tsx`, one of
  which is vendored shadcn source. Not worth it.

## Out of scope

- Everything backend: `GET /api/v1/config`, `POST /auth/demo`, the 403 guards on
  send/upload, demo data seeding, the periodic reset job, and any rate limiting.
  That is the foundation issue.
- Hiding or gating admin routes, and anything about what a demo user may do
  beyond email and uploads.
- Guest-session expiry UX (what the user sees when the demo resets underneath
  them mid-session) — real, but it needs the backend's reset semantics first.
- Wiring the frontend Vitest/Storybook suite into CI (PROJECT.md's named gap,
  Direction item 1).
- Updating PROJECT.md's out-of-date "Current State" section.
- Any change to non-demo behaviour, styling, or the design system.
