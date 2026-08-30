# Implementation notes — issue #99

## What was implemented

Followed plan.md as written; no deviations.

- `backend/src/demo.ts` (new): `demoMode()`, `FORBIDDEN_DEMO_ENV`,
  `forbiddenDemoEnvPresent()`, `DemoDisabledError`. `DEMO_MODE` did not exist
  anywhere in the repo (confirmed via grep before starting), so this defines
  the flag itself, per the plan's step-0 fallback.
- `backend/src/index.ts` — startup guard placed after the existing
  `GOOGLE_CLIENT_ID` guard, mirroring its fatal-log/`process.exit(1)` shape.
- `backend/src/mailer.ts` — `sendEmail()` throws `DemoDisabledError` as its
  first statement, before the `!apiKey || !from` check.
- `backend/src/storage/r2.ts` — `getClient()` throws `DemoDisabledError` as
  its first statement, before the credential check. This also 403s reads
  (`headObject`, presigned downloads), not just uploads — intentional per the
  plan (no R2 credentials exist in demo mode, so a download couldn't have
  worked anyway).
- `backend/src/app.ts` — terminal error handler maps `DemoDisabledError` to
  `403 { error: "Disabled in demo mode" }`, ahead of the Postgres-code checks.
  This is what covers `accountingDocuments.ts`/`policies.ts`'s PDF-generation
  paths through `storeGeneratedPolicyAttachment`, which have no
  `R2NotConfiguredError` handling of their own today.
- `backend/src/routes/mail.ts` — `handleMailError()` gets a `DemoDisabledError`
  branch ahead of the existing two.
- `backend/src/routes/policyAttachments.ts` — `isR2NotConfigured` renamed to
  `handleStorageError` (per plan step 4) and given a `DemoDisabledError`
  branch; all four call sites updated.
- `backend/src/emails.ts` — `sendWelcomeEmail()`'s catch chain now treats
  `DemoDisabledError` like `MailNotConfiguredError`/`MailSendError` (logs a
  `status: "failed"` email_log row, route still 201s — avoids the
  half-applied-invite bug the plan flagged). Also added to
  `sendCorrespondenceEmail()`'s log-then-rethrow chain for log symmetry, as
  the plan suggested optionally doing.
- `backend/src/jobs/scheduler.ts` — `startReminderScheduler()` checks
  `demoMode()` before `remindersEnabled()`, as its own early return with its
  own log line, returns `undefined`.
- `backend/src/routes/reminderRules.ts` — `POST /reminders/tick` returns
  `403 { error: "Disabled in demo mode" }` before calling
  `runReminderTickNow()`.
- `backend/.env.example` — documented `DEMO_MODE=false` with a comment naming
  the six forbidden variables.
- `docs/API.md` — added the demo-mode `403` note next to the existing
  mail-route status codes and in the automated-reminders section (tick).
- `vinDecoder.ts` / `routes/vinDecoder.ts` — untouched, as scoped.

## Tests added

- `backend/src/demo.test.ts` (new) — `forbiddenDemoEnvPresent()` over a plain
  object (empty when none set, each of the six named individually, all six
  together, `""` treated as unset) and `demoMode()` true only for the exact
  string `"true"`.
- `backend/src/routes/mail.test.ts` — one `DEMO_MODE=true` → 403 case per send
  route (`/clients/:clientId/send-email`, `/policies/:policyId/send-correspondence`),
  each asserting the Resend `fetch` stub was never called.
- `backend/src/routes/policyAttachments.test.ts` — a new
  `describe("POST /policy-attachments/presign")` block (no test file existed
  for that route before) with a `DEMO_MODE=true` → 403 case that exercises the
  *real*, unmocked `getPresignedUploadUrl` → `getClient()` seam end to end
  (this file's `vi.mock("../storage/r2")` only overrides
  `getPresignedDownloadUrl`/`headObject`, so `getPresignedUploadUrl` runs the
  real code and hits the real demo check). For the `/link` route, where
  `getPresignedDownloadUrl` *is* mocked, added a case that makes the mock
  reject with `DemoDisabledError` and asserts the route maps it to 403 —
  proving `handleStorageError`'s branch, since the real check can't fire
  through a fully-mocked function.
- `backend/src/jobs/reminders.test.ts` — `startReminderScheduler()` returns
  `undefined` with `DEMO_MODE=true` and `REMINDERS_ENABLED=true`; and a
  supertest case that `POST /reminders/tick` answers 403 in demo mode (added
  to the existing `describe("POST /reminders/tick")` block, alongside the
  existing regression case that a normal tick still 200s).

Regression coverage: the existing "returns 503 when mail isn't configured"
cases in `mail.test.ts` and the existing "plans and dispatches in one pass"
case in `reminders.test.ts` were left unchanged and still pass, confirming
non-demo behaviour is unaffected.

## Deviations from plan

None. `docs/API.md` doesn't have a dedicated status-code list for the R2-backed
policy-attachment routes (no `503` for `R2NotConfiguredError` was documented
there before this change either), so the demo-mode note there was limited to
the mail/correspondence/tick sections that already had status-code
documentation to extend — adding a new documentation section for attachment
status codes would have been scope creep beyond "note the demo-mode 403...
alongside the existing 503 documentation."

## Checks run

- `cd backend && npm run typecheck` — pass
- `npm run lint` — pass
- `npm run format:check` — one file needed `npm run format` (import-order
  wrapping in the new presign test block); reran and it passed clean
- `npx vitest run` — 30 files / 404 tests, all pass
- `npm run build` — pass
- No frontend changes, so no frontend checks were run.

## For the PR reviewer

The plan's own open questions still apply and weren't re-litigated here:
403 (vs. a zeroed-200) for `/reminders/tick`, and whether the frontend has a
blanket 403→logout interceptor that a demo 403 would trip (no frontend work
in this issue's scope, so unverified — flagged for a follow-up frontend
issue).
