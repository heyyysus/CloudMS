---
issue: 99
status: pending-review
---
# Demo mode: refuse outbound credentials, disable email/attachments/scheduler

## Goal

When `DEMO_MODE=true`:

1. The process **refuses to boot** — clear fatal log line, `process.exit(1)` — if any of
   `RESEND_API_KEY`, `MAIL_FROM`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
   `R2_BUCKET_NAME` is set to a non-empty value. A demo instance may not hold outbound
   credentials at all.
2. Every route that would send mail or touch R2 answers a deliberate
   `403 { error: "Disabled in demo mode" }` instead of the current `503`/generic 500, so the
   frontend can show a friendly message rather than an error toast.
3. The reminder scheduler never starts, and `POST /reminders/tick` ("Run now") does not run a
   plan/dispatch pass.
4. VIN decoding (`vinDecoder.ts` → NHTSA) is **untouched** and stays enabled.
5. With `DEMO_MODE` unset/false, behaviour is byte-for-byte what it is today (existing 503/502
   mapping, scheduler starts, tick runs).

Done = the above, plus vitest coverage for the startup guard and the 403 on the mail and
attachment routes.

## Scope check

Fits PROJECT.md's **fully cloud-based** pillar as operational hardening rather than a new
feature: it makes a public demo deployment of the existing stack safe to run beside the real
one. It does not advance any of the five Direction items directly, and it deliberately does not
touch the automated SMS/email pillar's behaviour in normal (non-demo) operation.

Triage labels look right: `enhancement`, `area:backend`. Everything in the issue's Scope section
is under `backend/`. The one caveat is the phrase "so the UI can show a friendly message" — that
frontend work is *not* in this issue's scope list, so no `area:frontend` label is warranted; see
Out of scope.

**Dependency:** `grep -rn "DEMO_MODE\|demoMode"` over the repo returns nothing today, so the
"foundation issue" that introduces the flag has not landed on `main` yet. This plan is written to
work either way — see Approach step 0.

## Files / areas

New:

- `backend/src/demo.ts` — the demo-mode predicate, the forbidden-env list, the pure startup-guard
  function, and `DemoDisabledError`. (If the foundation issue already created a demo module at a
  different path, e.g. `src/config/demo.ts`, extend that file instead of adding a second one.)
- `backend/src/demo.test.ts` — startup-guard + predicate unit tests.

Changed:

- `backend/src/index.ts` — call the startup guard next to the existing `GOOGLE_CLIENT_ID` guard.
- `backend/src/mailer.ts` — throw `DemoDisabledError` at the top of `sendEmail()`.
- `backend/src/storage/r2.ts` — throw `DemoDisabledError` at the top of `getClient()`.
- `backend/src/app.ts` — map `DemoDisabledError` to 403 in the existing terminal error handler.
- `backend/src/routes/mail.ts` — add a branch to `handleMailError()`.
- `backend/src/routes/policyAttachments.ts` — add a branch to `isR2NotConfigured()`.
- `backend/src/emails.ts` — `sendWelcomeEmail()` must treat `DemoDisabledError` like
  `MailNotConfiguredError` (see Approach step 5 — this one is a correctness fix, not polish).
- `backend/src/jobs/scheduler.ts` — `startReminderScheduler()` returns `undefined` in demo mode.
- `backend/src/routes/reminderRules.ts` — `POST /reminders/tick` returns 403 in demo mode.
- `backend/.env.example` — document `DEMO_MODE` (skip if the foundation issue already added it).
- `docs/API.md` — note the 403 on mail/attachment/tick endpoints under demo mode.

Tests changed: `backend/src/routes/mail.test.ts`, `backend/src/routes/policyAttachments.test.ts`,
plus a scheduler/tick case (`backend/src/jobs/reminders.test.ts` or a new
`backend/src/routes/reminderRules.test.ts` — no test file for that router exists today).

## Approach

**0. Reconcile with the foundation issue.** Before writing `src/demo.ts`, check whether a demo
module already exists on the branch base (`grep -rn "DEMO_MODE" backend/src`). If it does, import
its `demoMode()` (or equivalently-named) predicate and add only what's missing. Do not introduce a
second way to read the flag.

**1. `backend/src/demo.ts`.** Follow the read-env-at-the-call-site convention that `mailer.ts`,
`storage/r2.ts` and `jobs/config.ts` all document in their header comments — no module-load
caching, so tests can mutate `process.env` between cases:

```ts
export function demoMode(): boolean {
  return process.env.DEMO_MODE === "true"
}

// The credentials a demo instance may not hold. Kept as a list so the startup
// guard names every offender at once rather than failing one at a time.
export const FORBIDDEN_DEMO_ENV = [
  "RESEND_API_KEY", "MAIL_FROM",
  "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME",
] as const

// Pure so it can be unit-tested without spawning a process. Returns the names
// that are set; empty means safe to boot. An empty string counts as unset.
export function forbiddenDemoEnvPresent(env: NodeJS.ProcessEnv = process.env): string[]

// Thrown from the mail/storage seams. app.ts maps it to 403.
export class DemoDisabledError extends Error {}
```

Mirror the naming of the existing `MailNotConfiguredError` / `R2NotConfiguredError` classes.

**2. Startup guard in `index.ts`.** Mirror the shape of the existing `GOOGLE_CLIENT_ID` guard
exactly (it is the established pattern in this file):

```ts
if (demoMode()) {
  const present = forbiddenDemoEnvPresent()
  if (present.length > 0) {
    logger.fatal(`DEMO_MODE is set but ${present.join(", ")} is configured — refusing to start`)
    process.exit(1)
  }
}
```

Place it after the `GOOGLE_CLIENT_ID` block, before `app.listen`. Keep the logic itself in
`demo.ts` so the test covers the decision, not the exit.

**3. Enforce at the two seams, not per-route.** `sendEmail()` and `r2.getClient()` are the single
choke points every caller already funnels through — `routes/mail.ts`, `emails.ts`,
`jobs/dispatcher.ts`, `routes/users.ts`, `repositories/policyAttachments.ts`
(`storeGeneratedPolicyAttachment`, reached from `routes/accountingDocuments.ts` and
`routes/policies.ts`), and `routes/policyAttachments.ts`. Guarding there covers all of them with
two lines and cannot be bypassed by a route added later.

The check must be the **first** statement in each function, *before* the existing
`!apiKey || !from` / missing-R2-config checks — otherwise the startup guard's own guarantee
(credentials absent in demo) would make every call fall through to `MailNotConfiguredError` and
answer 503 instead of the intended 403.

**4. Map to 403.** Add the branch in `app.ts`'s terminal error handler, which Express 5 already
reaches for rejected async handlers:

```ts
if (err instanceof DemoDisabledError) {
  res.status(403).json({ error: "Disabled in demo mode" })
  return
}
```

This is what covers `routes/accountingDocuments.ts` and `routes/policies.ts`, which generate PDFs
through `storeGeneratedPolicyAttachment` and today do **not** map `R2NotConfiguredError` at all
(they would 500). Also add the explicit branch to `handleMailError()` in `routes/mail.ts` and to
`isR2NotConfigured()` in `routes/policyAttachments.ts` — those helpers return `false` for
unrecognised errors and the caller rethrows, so the app.ts handler would catch it anyway, but a
local branch keeps the per-route error contract readable and lets those routes log via `req.log`
the way the sibling branches do. Rename `isR2NotConfigured` to something like `handleStorageError`
to match its widened job.

**5. `emails.ts` — the invite path needs its own branch.** `POST /users` (invite) creates the user
row *first*, then calls `sendWelcomeEmail()`. `sendWelcomeEmail` catches `MailNotConfiguredError`
and `MailSendError`, writes a `status: "failed"` row to `emailLog`, and returns
`{ status: "failed" }` so the route still answers 201; anything else it rethrows. If
`DemoDisabledError` is left to propagate, a demo invite would create the user and then answer 403
with no email-log row — a half-applied mutation. So add `DemoDisabledError` to that same
`instanceof` chain with `error = "Disabled in demo mode"`.

`sendCorrespondenceEmail()` (emails.ts ~line 275) only logs-and-rethrows for the two mail errors;
letting `DemoDisabledError` through unlogged to a 403 is fine there — nothing is committed before
the send. Optionally add it to the chain for symmetry of the email log.

`jobs/dispatcher.ts`'s `MailNotConfiguredError` hold-and-decrement branch needs no change:
step 6 stops the dispatcher from running in demo mode at all.

**6. Scheduler.** In `startReminderScheduler()`, add a demo check next to the existing
`remindersEnabled()` early-return, with a matching log line
(`logger.info("Reminder scheduler disabled (DEMO_MODE)")`) and `return undefined`. Keep it in the
same shape as the existing branch rather than folding the two conditions together, so the log says
*why* it is off.

**7. Run now.** In `reminderRules.ts`'s `POST /reminders/tick`, return
`403 { error: "Disabled in demo mode" }` before calling `runReminderTickNow()`. *Judgement call:*
the issue says "no-op", which could equally mean a 200 with a zeroed `TickResult`. 403 is chosen
for consistency with the mail/attachment routes and because it gives the UI something to show;
flag it in the PR description so a reviewer can veto it cheaply. Guard the route, not
`runReminderTickNow()` itself, so the function keeps one behaviour.

**8. `vinDecoder.ts` / `routes/vinDecoder.ts`: no changes.** Explicitly leave them alone.

**9. Docs.** Add `DEMO_MODE=false` to `backend/.env.example` with a comment naming the six
variables that must be absent when it is true, and note the demo-mode 403 in `docs/API.md`
alongside the existing 503 documentation.

## Tests

Backend (vitest). Existing suites already show every pattern needed — reuse them rather than
inventing setup:

- **`src/demo.test.ts` (new).** `forbiddenDemoEnvPresent()` over a plain object: returns `[]` when
  none set; names the offender for each of the six variables individually; names all six when all
  are set; treats `""` as unset. Plus `demoMode()` true only for the exact string `"true"`.
  Testing the pure function keeps the suite away from `process.exit`.
- **`src/routes/mail.test.ts`.** Add cases to both send routes (`POST
  /clients/:clientId/send-email` and the correspondence send) asserting `403` and the error body
  with `DEMO_MODE=true`. The file already saves/restores `process.env` in its `afterEach`
  (`process.env = { ...ORIGINAL_ENV }`) and has a `configureMail()` helper, so a case only sets
  `process.env.DEMO_MODE = "true"`. Assert the Resend `fetch` stub was **not** called — a 403 that
  still hit the network would defeat the point.
- **`src/routes/policyAttachments.test.ts`.** The presign (`POST /policy-attachments/presign`) and
  download-url routes return 403 under `DEMO_MODE=true`. Note this file `vi.mock`s
  `../storage/r2`, so the mock must be arranged to let the real demo check run — either
  `importOriginal` the un-mocked function for these cases or assert at the route level that the
  mocked R2 functions were not called. Prefer the latter (simpler, and it asserts the thing that
  matters).
- **Scheduler.** A case that `startReminderScheduler()` returns `undefined` with `DEMO_MODE=true`
  and `REMINDERS_ENABLED=true` (add to `src/jobs/reminders.test.ts`), and a supertest case that
  `POST /reminders/tick` answers 403 — `reminderRules.ts` has no test file today, so this either
  starts `src/routes/reminderRules.test.ts` or goes in `reminders.test.ts`; either is fine, prefer
  wherever an admin session cookie is already minted.
- **Regression.** At least one existing-behaviour assertion per seam: with `DEMO_MODE` unset, mail
  still 503s when unconfigured and the tick endpoint still runs. The existing "returns 503 when
  mail isn't configured" cases already serve as this for mail — just confirm they still pass.

Use `TestContext` from `src/routes/testHelpers.ts` for any fixtures; never truncate a table.

Run: `cd backend && npx vitest run` (plus `npm run lint` / `npx tsc --noEmit` per CI). No frontend
changes, so no frontend build needed.

## Touches backend

yes

## Risks / open questions

- **The foundation issue has not landed.** `DEMO_MODE` appears nowhere in the repo today. If this
  branch is cut before the foundation merges, `demo.ts` defines the flag itself and the two will
  need reconciling at merge — see Approach step 0. Worth confirming the foundation's module path
  and predicate name before starting.
- **403 vs. some other status.** 403 is what the issue asks for, but it is normally an
  authorization signal; a client that treats 403 globally as "session lost / log out" would
  misbehave. Check the frontend's API-error handling for a blanket 403 → logout rule before
  merging. If one exists, the discriminating `error` string in the body is what the frontend
  should key on.
- **`getClient()` also guards reads.** Putting the check in `r2.getClient()` means *downloading an
  existing* attachment 403s too, not just uploading. In demo mode there are no R2 credentials at
  all, so a download could not have worked regardless — 403 is a better answer than the current
  503. Confirm that is the intended reading of "disable attachments".
- **Startup guard is not covered end-to-end.** The unit test covers the decision; nothing asserts
  that `index.ts` actually exits non-zero. A subprocess test (`tsx src/index.ts` with a stub env)
  would be genuine coverage but is slow and needs a reachable `DATABASE_URL`. Recommend skipping
  it and keeping the guard in `index.ts` down to three lines of glue.
- **`/reminders/tick` 403 vs. zeroed 200** — see Approach step 7.
- The startup guard only inspects `process.env` at boot. Nothing stops a deployment from injecting
  credentials later; that is out of this issue's reach and acceptable.

## Out of scope

- **Frontend changes.** No component work, no friendly-message UI, no 403 handling in the API
  client. The issue's scope list is backend-only; the backend contract this lands is what a
  follow-up frontend issue would build on.
- Introducing the `DEMO_MODE` flag itself, and any demo data seeding, read-only enforcement, or
  demo-user provisioning — those belong to the foundation issue and its siblings.
- VIN decoding and TurboRater import: explicitly left enabled and unmodified.
- Any change to non-demo behaviour: the existing 503/502 mapping, the dispatcher's
  hold-and-decrement retry logic, and reminder planning all stay exactly as they are.
- Deployment wiring (Docker Compose / GitHub Actions env for a demo host).
