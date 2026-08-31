---
issue: 100
---
# Implementation notes for #100

Implemented per plan.md, frontend only. Branch was merged with `origin/main`
first so the foundation (#98: `GET /config`, `POST /auth/demo`, `users.is_demo`)
is present.

## What landed

- `src/api/config.ts` — `AppConfig` + `getConfig()`. The real endpoint returns
  only `{ demoMode }`; `demoResetMinutes` stays optional and the banner falls
  back to "resets periodically". Wire it up when #101 exposes the interval.
- `src/config/AppConfigContext.tsx` — `AppConfigProvider` / `useAppConfig()`,
  fails open to `{ demoMode: false }` on any error.
- `src/api/auth.ts` — `loginAsDemoUser(name)`; `/auth/demo` answers `{ user }`
  like the other auth routes (checked against `backend/src/auth/demoRoutes.ts`).
- `src/components/auth/google-sign-in-panel.tsx` — literal lift of the Google
  block from `Login.tsx`, so `useGoogleSignIn` is never called in demo mode.
- `src/components/auth/demo-sign-in-form.tsx` + stories — name prompt with an
  injectable `signInFn`; 429/503 mapped to friendlier copy.
- `src/components/layout/demo-banner.tsx` + stories — takes `demoMode` /
  `resetMinutes` as props (rather than calling `useAppConfig()`) so it renders
  in stories without a provider. Mounted in `app-layout.tsx` as the first child
  of `SidebarInset` and at the top of `Login.tsx`. Not added to `Logout.tsx`
  (a sub-second spinner screen; not worth the wrapper).
- `src/lib/demo.ts` + unit tests — `isDemoDisabledError`, `demoBannerText`.
  The backend has no machine-readable code in the 403 body, so the message
  regex from the plan stands.
- `SendCorrespondenceDialog` gains `disabled`; `PolicyAttachments` gains
  `uploadDisabled` (greyed button, `title`, demo empty-state copy).
  `ClientDetail` passes `config.demoMode` to both and toasts on a non-rater
  file drop in demo mode; rater-file imports still work.
- Both upload/send `onError` handlers map a demo 403 to
  "This action is disabled in the demo."

## Deviations

- The `Disabled` story asserts the trigger is disabled and carries the `title`
  rather than clicking it — `userEvent` refuses to click `pointer-events: none`
  elements, which is the assertion anyway.

## Checks run

`npm run lint` (warnings only, same class as existing context files),
`npx tsc -b`, `npm run build`, `npx vitest run --project unit` (91/91),
`npx vitest run --project storybook` (254 stories; one unrelated story,
`log-detail-dialog > Open`, flaked under the parallel run and passes alone).
Manual boot-path check against a running backend was not performed here.
