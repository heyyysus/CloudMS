# Implementation notes — issue #89

## Why this file was missing

The pipeline coder run for #89 ended with
`Execution failed: Reached maximum number of turns (80)`
([run 33447400404](https://github.com/heyyysus/CloudMS/actions/runs/33447400404)).
It had already committed and pushed its six commits, but stopped before
writing this file, so the stage's artifact check failed the job and the issue
picked up `needs-human`. The code work was not lost — unlike #101, whose
coder run died with everything still uncommitted in the runner's working tree.

This branch carries those six commits forward unchanged (merge commit) and
adds the reconciliation described below.

## What the pipeline coder implemented (commits carried forward)

- `dc188d7` — **Reapply of #99** ("refuse outbound credentials, disable
  email/attachments/scheduler"), which had been reverted in #106 for landing
  before its foundation (#98). #98 has since landed, so the revert-of-the-revert
  is what re-lands it. Reconciled against `demoMode()` having moved to
  `config.ts`: no duplicate definition, no leftover `src/demo.ts`.
  - Boot guard: `forbiddenDemoEnvPresent()` + a fatal exit in `index.ts` if
    `RESEND_API_KEY`/`MAIL_FROM`/`R2_*` are set while `DEMO_MODE=true`.
  - `DemoDisabledError` thrown from `sendEmail()` and `storage/r2.ts`'s
    client getter — the two seams every mail/attachment caller funnels
    through — mapped to 403 rather than a confusing 5xx.
  - `startReminderScheduler()` no-ops in demo mode.
- `20b5d21` — `demoResetMinutes` on `GET /config` for the frontend banner.
- `5b1ecef` — `POST /auth/demo` rate limit, `DEMO_SIGNIN_LIMIT_PER_HOUR` per
  IP per rolling hour, in-memory fixed window.
- `086a5b7` — `docs/demo-mode.md`.

## Reconciliation with #101/#112 (the substantive work here)

#112 (the demo reseed job and demo deploy definition) merged **after** this
branch was cut, and the two collided semantically without colliding textually
— `git merge` reported conflicts only in `backend/.env.example` and
`backend/src/index.ts`, both trivial. The real problem was invisible to git:

- **Two knobs for one concept.** This branch added `DEMO_RESET_MINUTES`
  (default 60) purely to feed the banner, with a comment stating that "today
  this is a manually-run `npm run db:seed`, not an in-process timer" — true
  when written, false once #112 landed an in-process reseed job driven by
  `DEMO_RESEED_INTERVAL_MINUTES` (default 15). Merging as-is would have shipped
  a banner telling visitors the demo resets hourly while it actually reset
  every 15 minutes, with nothing to catch the drift.

  Fixed by deriving `demoResetMinutes()` from `demoReseedConfig()` instead of
  its own env var, and dropping `DEMO_RESET_MINUTES` entirely. The number the
  banner shows is now definitionally the cadence the job runs at.

- Because the reseed interval always resolves to a positive number, the
  route's `resetMinutes > 0 ? … : {}` branch became unreachable in demo mode.
  Simplified to always include the field, and the "omits when 0" test was
  replaced with one asserting the non-positive value falls back to the default
  (15) rather than reporting zero. `GET /config` on a non-demo instance is
  still byte-identical to `{ demoMode: false }`.

- `docs/demo-mode.md`'s "Resetting a demo host" section documented setting up
  a cron running `npm run db:seed` and manually matching the banner's interval
  to it. Rewritten: the reset is automatic and in-process, the wipe preserves
  demo users and their sessions, and `npm run db:seed` is explicitly called out
  as the wrong tool against a demo host (it is the full wipe, and would sign
  every visitor out). Its "Deploying a demo instance" section now defers to
  `docs/demo-deployment.md` rather than re-describing a manual deploy.

- `docs/API.md` updated for the `demoResetMinutes` derivation and its now
  always-present-in-demo-mode status.

- `.env.demo.example` (from #112) updated: the omission of Resend/R2 keys is
  now *enforced* (the process refuses to boot with them set), not merely
  conventional, and the file said otherwise. Added
  `DEMO_SIGNIN_LIMIT_PER_HOUR`. `REMINDERS_ENABLED=false` is now described as
  the second switch it is, since demo mode already stops the scheduler.

## Checks run (all green)

From `backend/`: `npm run typecheck`, `npm run lint`, `npm run format:check`,
`npm test` (**435 passed**, up from 411 on `main` — this branch adds
`demo.test.ts`, `middleware/demoSignInLimit.test.ts`, and cases in
`routes/mail.test.ts`, `routes/policyAttachments.test.ts`,
`jobs/reminders.test.ts`), `npm run build`. Frontend untouched.

Ran against a local PostgreSQL 16 instance rather than the usual Docker
container (no Docker daemon in this environment); `npx tsx src/db/migrate.ts`
was run against it first, which CLAUDE.md notes is additive and idempotent.

## For the PR reviewer

- The `#99` re-land is the security-relevant half of this branch. Worth
  reviewing `sendEmail()` and `storage/r2.ts` specifically: the demo check sits
  at the top of each seam, *before* the credential check, so it fails closed
  even if a key is somehow present.
- The rate limiter is deliberately a speed bump, not a control — in-memory,
  per-container, and keyed on `X-Forwarded-For` because `app.ts` does not set
  `trust proxy`. `docs/demo-mode.md` says so plainly; that framing should
  survive review rather than being read as a security guarantee.
- Frontend banner copy is out of scope here (that was #100, already merged).
  If the banner hard-codes a cadence anywhere rather than reading
  `demoResetMinutes`, that is worth a follow-up — this PR only guarantees the
  API reports the truth.
