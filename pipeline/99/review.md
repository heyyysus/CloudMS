# Plan review — issue #99

## Findings

- Scope matches the issue exactly: startup guard, 403 on mail/R2 seams, scheduler/tick no-op,
  VIN decoding left alone, tests for the guard and the 403s. Nothing extra (no frontend work, no
  demo-data seeding) is pulled in, and the plan is explicit about deferring those to the
  foundation/frontend issues (plan "Out of scope").
- Direction: correctly scoped as operational hardening rather than a roadmap feature; doesn't
  conflict with PROJECT.md's five Direction items or the four pillars. Reasonable call.
- Soundness — spot-checked every file the plan cites against the current tree:
  - `DEMO_MODE`/`demoMode` genuinely doesn't exist anywhere in the repo yet (`grep -rn` empty),
    confirming the plan's "foundation issue hasn't landed" premise and its step-0 reconciliation
    plan.
  - `backend/src/index.ts:7-8` has the exact `GOOGLE_CLIENT_ID` fatal-log/`process.exit(1)` shape
    the plan says to mirror.
  - `mailer.ts` and `storage/r2.ts` both read config inline per-call (no module-load caching, per
    their header comments) — the plan's "check must be the first statement" ordering claim (before
    the existing `!apiKey || !from` check) is necessary and correctly identified: otherwise demo
    mode's own guarantee that creds are absent would make every call fall through to
    `MailNotConfiguredError`/`R2NotConfiguredError` (503) instead of the intended 403.
  - `routes/mail.ts:80-88` (`handleMailError`) and `routes/policyAttachments.ts:32-34`
    (`isR2NotConfigured`) match the plan's description of where to add branches.
  - Verified the plan's specific claim that `routes/accountingDocuments.ts` and `routes/policies.ts`
    call `storeGeneratedPolicyAttachment` inside bare `catch (err)` blocks with no
    `R2NotConfiguredError` handling — confirmed, so today those paths do 500 on missing R2 config,
    and the plan's app.ts-level catch-all is what actually fixes coverage there. Good catch, not a
    padding claim.
  - `emails.ts:109-125` confirms `sendWelcomeEmail`'s catch chain (`MailNotConfiguredError` /
    `MailSendError` → `status: "failed"` email-log row, function returns normally so the route
    still 201s) — the plan's step 5 (add `DemoDisabledError` to that chain to avoid a half-applied
    invite mutation) is a real correctness point, not scope creep.
  - `jobs/scheduler.ts:52-55` and `routes/reminderRules.ts:170-174` match the plan's description
    of `startReminderScheduler`'s `remindersEnabled()` early-return shape and the tick route.
  - `backend/src/app.ts:78-97` is a Postgres-code-keyed terminal handler, not a generic
    instanceof-dispatch chain, but adding an `instanceof DemoDisabledError` branch ahead of the
    final `res.status(500)` fits the existing pattern fine (also branches early on conditions with
    return).
  - Reuses existing conventions throughout (naming mirrors `MailNotConfiguredError`/
    `R2NotConfiguredError`; pure/testable predicate function; log-then-exit shape).
- Tests: plan correctly directs use of `TestContext`/existing fixtures, cites `mail.test.ts`'s
  real `ORIGINAL_ENV`/`afterEach` restore pattern and `configureMail()` helper (verified present),
  asks for a regression case (existing 503 behavior with `DEMO_MODE` unset) and a not-called
  assertion on the network/mock so a 403 that still hit Resend/R2 wouldn't pass. This is a
  materially better test list than "add some tests."
- Security: this issue is itself a security control (credential lockout + fail-closed startup
  guard), and the plan gets the fail-closed direction right — refuse to boot with creds present,
  guard on the shared seam so no future route can bypass it. No secrets are logged (the fatal log
  names env var keys, not values). No auth/session changes.
- Conventions: no CLAUDE.md violations. Plan explicitly follows the read-env-per-call convention
  documented in the affected files' own header comments rather than introducing caching.
- Minor/flagged-by-plan-itself judgment calls, correctly surfaced as open questions rather than
  silently decided: 403 vs 200-with-zeroed-result for `/reminders/tick`, and whether a blanket
  frontend 403→logout interceptor exists (would need frontend follow-up, but out of this issue's
  scope regardless). Neither is a blocking soundness issue for backend-only work.

## Required changes (if rejected)

None.

Verdict: approved
