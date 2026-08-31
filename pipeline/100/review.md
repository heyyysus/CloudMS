# Plan review — issue #100

## Findings

- **Scope matches the issue precisely.** All five "Done" criteria from #100 are
  addressed: config-on-boot with fail-open default, demo name-prompt sign-in
  replacing Google sign-in, a persistent banner, disabled email/upload
  affordances with a 403 toast fallback, and an explicit no-op when
  `demoMode` is false. The plan correctly stays frontend-only and defers the
  two backend endpoints (`/api/v1/config`, `/auth/demo`) to the foundation
  issue, matching the issue body's stated dependency.
- **Spot-checked file/line references are all accurate.** Verified against the
  actual repo: `Login.tsx` (useGoogleSignIn call, buttonRef div, scriptError
  paragraph), `App.tsx`'s provider nesting (`ToastProvider > BrowserRouter >
  AuthProvider`, so `AppConfigProvider` slots in exactly where claimed),
  `send-correspondence-dialog.tsx:160` (`onError` toast) and `:171-175`
  (`DialogTrigger`/`Button`), `policy-attachments.tsx:137` (Add attachment
  button) and `:154` (empty-state copy, verbatim match), `ClientDetail.tsx:313`
  and `:346` (dialog call sites) and `:146-158` (`useFileDrop` handler, rater
  vs. non-rater branches exactly as described), `add-attachment-dialog.tsx:213`
  (`onError` toast), `sidebar.tsx:138` (`min-h-svh` wrapper class), `index.css:29`
  (`--color-warning` token), and `toast.tsx:161-168` (fixed-top viewport,
  deliberate header overlap). This is an unusually well-verified plan.
- **Soundness.** Approach reuses established codebase patterns throughout:
  `AuthContext`-shaped provider, react-hook-form + zod with `Field`/
  `SubmitButton` like other dialogs, injectable `signInFn`/`sendFn`-style props
  for storybook testability, boolean props threaded down from pages rather than
  components reading context directly (matches `isAdmin`/`currentUserId`
  convention). The fail-open `catch(() => setConfig({ demoMode: false }))` is
  the right call for safely merging ahead of the backend dependency, and is
  correctly identified as the single most load-bearing line.
- **Banner placement reasoning is sound and appropriately cautious.** The plan
  diagnoses and avoids a real layout bug (fixed sidebar + `min-h-svh` shell
  would double-count height with a naive top-of-document banner) rather than
  guessing; two call sites is a reasonable trade against touching vendored
  shadcn source.
- **Tests are adequate for a frontend-only change.** Lint/typecheck/build,
  `vitest run` (unit + storybook projects), new/updated `.stories.tsx` files
  covering the demo sign-in form's happy/empty/error paths and the
  disabled-affordance states, plus a manual boot-path check against a backend
  without `/config` (today's actual state). TestContext doesn't apply — no
  backend code is touched, which the plan states explicitly and correctly
  ("Touches backend: No").
- **Security is reasonable for this slice.** Demo-mode disabling is UI-only
  (defense in depth, not the actual enforcement — that's the backend's job per
  the foundation issue), and the plan is honest that server-side 403s are the
  real gate. It flags, rather than silently assumes, the one real risk in its
  scope: if `/auth/demo` mints an `admin` role, `/admin/*` routes are exposed
  in demo mode — correctly noted as out of scope/foundation-issue's call
  rather than papered over.
- **Conventions.** No CLAUDE.md violations found (concurrent-agents section
  correctly ignored per instructions). No new dependencies, no vendored
  shadcn/`components/ui/*` edits, matches stated file-level guardrails
  ("Do not change" list).
- **Minor, not blocking:** the plan flags its own judgment calls transparently
  (disable-vs-hide, banner placement, demo-role/admin-route exposure) rather
  than making silent choices — these are reasonable defaults and appropriately
  left for human review rather than the plan overreaching to decide them.

## Required changes (if rejected)

N/A — approved.

Verdict: approved
