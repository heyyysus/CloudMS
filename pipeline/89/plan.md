---
issue: 89
status: pending-review
---
# Demo mode: close out the remaining gaps (re-land #99, add the reset job, rate-limit demo sign-in)

## Goal

**The issue body is empty.** Issue #89 is titled "Demo mode" and carries no
description, so there is no stated acceptance criteria to plan against. I could
not read the issue or its comments directly — `gh issue view 89` and
`gh api repos/heyyysus/CloudMS/issues/89` both require approval on this runner —
so everything below is derived from the repository itself. **Read
*Risks / open questions* before coding: if the real issue body says something
different from the assumption below, this plan is wrong and should be redone.**

### The assumption

#89 is the *umbrella* "Demo mode" issue, opened around the time of #87/#88 and
then decomposed by hand into the lettered children #98–#102 (the merged plans in
`pipeline/98/`, `pipeline/100/` and `pipeline/102/` refer to each other as
"#A–#E", to a "#101's reseed", and to "#C"/"#E" that were never separately
planned). Most of that decomposition has landed. So "done" for #89 means
*demo mode is actually complete and safe to deploy*, not a fresh feature.

### What has already landed (verified in `main`)

| Piece | Commit | State |
|---|---|---|
| `DEMO_MODE` / `DEMO_SESSION_TTL_MINUTES` in `backend/src/config.ts`, `GET /config`, `POST /auth/demo`, `users.is_demo`, startup warning | `86cc1f3` (#98) | done |
| Body cap `256kb` + `demoRowCeiling` middleware on 9 create routes | `c55c3c2` (#102) | done |
| Frontend: `AppConfigProvider`, demo sign-in form, `DemoBanner`, disabled send/upload | `54be3a0` (#100) | done |
| Refuse outbound credentials; 403 from mail/storage seams; scheduler off in demo | `37cf1ed` (#99) | **reverted** by `ad5292a` |

### What "done" means for this issue

1. **#99 is re-landed.** `ad5292a`'s own commit message is an explicit
   instruction: *"Merged before its foundation (#98) landed; re-land by
   reverting this commit once #98 is in."* #98 is now in (`86cc1f3`, merged
   *after* the revert), so the precondition is met. A demo instance refuses to
   boot with `RESEND_API_KEY` / `MAIL_FROM` / `R2_*` set, mail and attachment
   routes answer `403 "... demo mode ..."` (the shape
   `frontend/src/lib/demo.ts:isDemoDisabledError` already matches), and the
   reminder scheduler does not start.
2. **A demo reset exists**, and `GET /config` reports its interval as
   `demoResetMinutes`. Two pieces of merged code already promise a reset that
   does not exist anywhere in the repo:
   - `backend/src/config.ts:20-22` — "creates on it are refused **until the next
     reseed**"; `demoRowCeiling`'s 429 message says "data resets on the next
     reseed."
   - `frontend/src/api/config.ts:5-7` and `frontend/src/lib/demo.ts:10-13` — the
     banner already accepts an optional `demoResetMinutes` and falls back to
     "resets periodically" because the server never sends one.
     Today a demo instance never resets and the banner never shows a number.
3. **`POST /auth/demo` is rate-limited.** It is unauthenticated and mints an
   `admin` user row plus a session on every call, with no limit of any kind
   (no rate-limit dependency exists in `backend/package.json`). `pipeline/98/plan.md`
   deferred this to "#E", which was never opened.
4. **A demo deployment is documented** — how to stand the instance up, and the
   fact that it needs its own database.

## Scope check

Demo mode is not on PROJECT.md's Direction list (dashboard → more lines of
business → integrations → SMS/email → AI). It is enabling work for a public demo
deployment, sitting under the "fully cloud-based" pillar: same image, separate
deployment, own database, one env var. `pipeline/98/plan.md` and
`pipeline/102/plan.md` both make the same call, so this is consistent with how
the earlier children were reviewed and approved.

**Triage labels look partly wrong.** `enhancement`, `agent`,
`pipeline:needs-plan` are right. `area:frontend` is **not** — the frontend half
of demo mode already shipped in #100 and nothing in the residual scope above is
a frontend change. The label should be `area:backend`. (Item 2 makes the
existing `demoResetMinutes` frontend path *start working* by populating it from
the server; that is still a backend change.)

## Files / areas

**Item 1 — re-land #99** (restored by reverting `ad5292a`, then reconciled):

- `backend/src/demo.ts`, `backend/src/demo.test.ts` — restored by the revert.
  **These must not survive as-is**: `demo.ts` carries its own `demoMode()`,
  duplicating `backend/src/config.ts:12`, which did not exist when #99 was
  written. Fold the forbidden-env list and `DemoDisabledError` into
  `backend/src/config.ts` (or keep `demo.ts` but have it re-export
  `demoMode` from `config.ts`) and delete the duplicate predicate.
- `backend/src/mailer.ts`, `backend/src/emails.ts`, `backend/src/storage/r2.ts` —
  the two seams (`sendEmail()`, `getClient()`) plus `sendWelcomeEmail()`'s catch chain.
- `backend/src/routes/mail.ts`, `backend/src/routes/policyAttachments.ts`,
  `backend/src/routes/reminderRules.ts` — `DemoDisabledError` → 403.
- `backend/src/jobs/scheduler.ts`, `backend/src/index.ts` — scheduler off, boot guard.
- `backend/src/routes/mail.test.ts`, `backend/src/routes/policyAttachments.test.ts`,
  `backend/src/jobs/reminders.test.ts` — restored tests.
- `backend/src/app.ts` — note the revert restores a 5-line hunk here; the error
  handler has since grown the 4xx/413 branch (`app.ts:93-101`), so this is the
  most likely conflict.
- `backend/.env.example`, `docs/API.md`.

**Item 2 — demo reset:**

- Add `backend/src/jobs/demoReset.ts` — the reset pass + its interval timer.
- Change `backend/src/config.ts` — `demoResetMinutes()` (`DEMO_RESET_MINUTES`,
  default 60; `0` = never).
- Change `backend/src/routes/config.ts` — include `demoResetMinutes` in the
  payload **only when demo mode is on**.
- Change `backend/src/index.ts` — start the timer when `demoMode()`.
- Add `backend/src/jobs/demoReset.test.ts`; change `backend/src/routes/config.test.ts`.
- `backend/.env.example`, `docs/API.md`.

**Item 3 — rate limit:**

- Add `backend/src/middleware/demoSignInLimit.ts` + its test.
- Change `backend/src/auth/demoRoutes.ts` to mount it.

**Item 4 — docs:**

- Add `docs/demo-mode.md`; link it from `docs/API.md` and
  `docs/AUTH_SESSIONS_EXPLAINED.md`.

Not changed: `frontend/` (already handles every field this adds),
`backend/src/db/schema.ts` and `backend/drizzle/` (no new columns).

## Approach

Land these as **separate commits** on `agent/issue-89`, in this order. Item 1 is
the highest-value and lowest-risk piece; if the turn budget runs short, stop
after item 1 or 2 and say so in `notes.md` rather than half-landing item 3.

### 1. Re-land #99

1. `git revert --no-commit ad5292a` (revert the revert). Expect conflicts in
   `backend/src/app.ts` (the error handler grew the 4xx branch since) and
   possibly `backend/.env.example` (which grew the `DEMO_*` block from #98/#102).
   Resolve by keeping *both* sides — nothing #99 added conflicts semantically
   with #98/#102.
2. `pipeline/99/{plan,notes,review}.md` come back with the revert. Keep them;
   they are the paper trail the pipeline README expects.
3. **Reconcile the duplicated predicate.** After the revert there are two
   `demoMode()` definitions. `backend/src/config.ts` is the one every other
   demo caller imports (`app.ts:6`, `index.ts:2`, `routes/config.ts:2`,
   `middleware/demoRowCeiling.ts`), so it wins: move `FORBIDDEN_DEMO_ENV` /
   `forbiddenDemoEnvPresent()` / `DemoDisabledError` into `config.ts`, delete
   `demo.ts`'s copy of `demoMode()`, and update imports in `demo.test.ts`,
   `mailer.ts`, `emails.ts`, `storage/r2.ts`, `jobs/scheduler.ts`, `index.ts`.
   Keep the ordering constraint #99's commit message calls out: **the demo check
   must run before the "not configured" check** in both `sendEmail()` and
   `getClient()`, or demo mode's own guarantee that credentials are absent makes
   every call 503 instead of the intended 403.
4. Confirm the 403 body still matches `/demo mode/i` — `frontend/src/lib/demo.ts`
   sniffs the message text, and the frontend toasts depend on it.

### 2. Demo reset job

Model it on `backend/src/jobs/scheduler.ts` — same shape, deliberately: a module
-level `running` guard so a slow pass cannot stack, a `try/catch` that logs and
lets the next tick retry, and `unref()`-style startup from `index.ts` behind a
flag.

```ts
// backend/src/jobs/demoReset.ts
export async function runDemoReset(): Promise<{ reset: boolean }> {
  if (!demoMode()) return { reset: false }        // belt and braces - never wipe a real DB
  ...
}
```

- **Reuse `wipe()` + `seed()` from `backend/src/db/seed/`.** `seed/run.ts`
  already calls `wipe()` first, so the reset is one `seed()` call. `wipe()`
  deletes `sessions` too, so live demo visitors are signed out on reset — that
  is the intended behaviour and the banner warns about it.
- **Election:** copy `backend/src/jobs/planner.ts:70-77`'s
  `pg_try_advisory_xact_lock` with a *new distinct* lock key (do not reuse
  `PLANNER_LOCK_KEY`). Multiple app containers must not reseed concurrently.
- **Two independent guards before any delete:** `demoMode()` must be true *and*
  the caller must be the timer started under `demoMode()`. A wipe on a real
  instance is unrecoverable; one check is not enough.
- `demoResetMinutes()` in `config.ts` via the existing `num()` helper. `0` or
  unset-but-demo → do not start the timer, and do not report the field.
- `routes/config.ts`: `res.json(demoMode() ? { demoMode: true, demoResetMinutes: n } : { demoMode: false })`.
  Keep the non-demo payload byte-identical to today's — it is a public endpoint
  on the real production instance, and `config.test.ts` asserts the exact body.
  Omit the field when the interval is `0` so the banner falls back to its
  "resets periodically" copy rather than rendering "every 0 minutes"
  (`frontend/src/lib/demo.ts:11` already handles the absent case).

### 3. Rate-limit `POST /auth/demo`

Prefer **no new dependency**: a small in-memory fixed-window limiter keyed on
`req.ip`, in `backend/src/middleware/demoSignInLimit.ts`, mounted only on the
demo router (which itself is only mounted when `demoMode()` — `app.ts:49`).
Suggested default: 5 sign-ins per IP per hour, `DEMO_SIGNIN_LIMIT_PER_HOUR`.
Over the limit → **429** with the same `{ error: ... }` shape everything else
uses, matching how `demoRowCeiling` reports its ceiling.

Two things to get right:

- **`req.ip` behind nginx + Cloudflare is the proxy's address** unless
  `app.set("trust proxy", ...)` is configured — it currently is not (`app.ts`
  has no such call). Adding `trust proxy` globally changes request handling on
  the *real* instance too, so either (a) read `X-Forwarded-For`'s left-most
  entry inside the limiter only, and document that it is spoofable and this is a
  speed bump not a security control, or (b) set `trust proxy` and say so
  explicitly in the PR description. **Recommend (a)** — smaller blast radius.
- In-memory means per-container and lost on restart. That is acceptable for a
  demo speed bump; say so in a comment rather than reaching for Redis.

### 4. `docs/demo-mode.md`

One page: every `DEMO_*` env var and its default, the "own database, never the
real one" rule, the boot guard on outbound credentials, what the reset does and
how often, and a loud "never set `DEMO_MODE=true` on the real instance —
`POST /auth/demo` mints admin accounts". Link from `docs/API.md`'s Config
section and `docs/AUTH_SESSIONS_EXPLAINED.md`.

## Tests

Backend, `cd backend && npx vitest run`. Use `TestContext` /
`makeSessionCookie` from `src/routes/testHelpers.ts`; never truncate a table,
never assert a global row count.

- **Item 1:** the restored `mail.test.ts`, `policyAttachments.test.ts`,
  `reminders.test.ts` and `demo.test.ts` cases come back with the revert. Fix
  their imports for the `demo.ts` → `config.ts` consolidation, then confirm they
  pass unchanged in substance. Do not weaken an assertion to make the revert
  apply — a failure there is a real reconciliation bug.
- **Item 2 — `src/jobs/demoReset.test.ts`. This is the dangerous file.**
  `wipe()` deletes *every* row in `users`, `clients`, `persons`, `carriers`,
  `sessions`… — running it against the shared `myapp` database destroys other
  agents' fixtures mid-run and is exactly what CLAUDE.md forbids. So:
  - Test `runDemoReset()` **with `DEMO_MODE` unset** and assert it returns
    `{ reset: false }` and performs no deletes (spy on `wipe`/`seed` via
    `vi.mock("../db/seed/run")` — assert `seed` was *not* called).
  - Test the demo-on path with `seed` **mocked**, asserting only that the guard
    let it through and the advisory lock was taken. Never let a real `wipe()`
    run inside `vitest`.
  - Test the interval arithmetic and the `0`-means-never branch as pure
    functions, with no database.
  - If the coder wants one genuine end-to-end reseed check, do it manually
    against a throwaway database (`createdb -U postgres myapp_demo89`, inline
    `DATABASE_URL`, drop it after) and record the result in `notes.md` — do not
    commit it as a test.
- **Item 2 — `src/routes/config.test.ts`:** default (demo off) body is still
  exactly `{ demoMode: false }` and carries no `demoResetMinutes` key;
  `DEMO_MODE=true` + `DEMO_RESET_MINUTES=30` → `{ demoMode: true, demoResetMinutes: 30 }`;
  `DEMO_RESET_MINUTES=0` → field absent.
- **Item 3 — `src/middleware/demoSignInLimit.test.ts`:** under the limit passes;
  the (N+1)th from the same IP → 429 with a JSON `error`; a different IP is
  unaffected; the window rolls (drive it with `vi.useFakeTimers()`). Clean up by
  deleting exactly the user ids the test created — **not** by
  `like(users.email, "demo-%")`, which would reach rows the test did not create
  (`pipeline/98/plan.md` calls this out and it still applies).

Also run from `backend/`: `npm run typecheck`, `npm run lint`,
`npm run format:check`. Run `npx tsx src/db/migrate.ts` first if the database is
behind — it is additive and idempotent; no new migration is introduced here.

Frontend is untouched, so no frontend run is required. If the coder does touch
`frontend/`, run `npm run lint && npm run build` there.

## Touches backend

yes

## Risks / open questions

- **The issue body is empty and I could not fetch it.** This is the single
  largest risk in the plan. The questions that need answering before this is
  trusted:
  1. Is #89 really the umbrella for #98–#102, or is it an older, differently
     scoped "demo mode" request that predates them?
  2. If it is the umbrella, is the intent to *close out* the remainder (this
     plan) or simply to close #89 as already-delivered by its children?
  3. Is a public demo instance actually being deployed? Items 2–4 only earn
     their cost if it is. If there is no deployment, item 1 alone is the whole
     job.
  4. Is `DEMO_RESET_MINUTES=60` the interval the maintainer wants? The banner
     copy shows this number to every visitor.
- **Reverting a revert can silently re-introduce a bug.** #99 was reverted for
  *sequencing*, not for a defect — the message is explicit about that — but four
  commits have landed on the touched files since. The `app.ts` error handler in
  particular has changed. Re-read every restored hunk rather than trusting a
  clean `git revert`.
- **`wipe()` is unrecoverable if it ever runs against the wrong database.** This
  is the reason for the double guard in step 2 and for keeping `seed` mocked in
  tests. If the plan reviewer thinks the risk is not worth the banner accuracy,
  cutting item 2 down to *just* `demoResetMinutes` in `GET /config` plus a
  documented manual `npm run db:seed` on the demo host is a legitimate, much
  safer alternative — flag it as an option rather than a silent scope cut.
- **The rate limiter is a speed bump, not a control.** In-memory, per-container,
  and keyed on a spoofable header. Say this in the PR description so nobody
  reads it as protection against a determined actor.
- **Demo `users` rows still accumulate** between resets — one per sign-in. The
  reset is the only thing that prunes them, so on an instance with
  `DEMO_RESET_MINUTES=0` they grow without bound. The row ceiling does not cover
  `users` (`demoRowCeiling` is mounted on 9 create routes, none of them the auth
  path).
- **`backend/package.json`'s `db:seed` script points at `src/db/seed.ts`** while
  the implementation lives in `src/db/seed/`. Both paths exist; confirm which
  one the script actually resolves before reusing `seed()` in the reset job.

## Out of scope

- Any frontend change — the frontend half of demo mode shipped in #100 and
  already consumes every field this plan adds.
- Seeding *demo-flavoured* content (curated fake agency data distinct from
  `src/db/seed/`'s 100 clients / 300 policies). The reset reuses the existing
  seed as-is.
- Schema or migration changes; `users.is_demo` from #98 is sufficient.
- Changing `SESSION_TTL_MS`, the Google sign-in flow, or the invite flow.
- Rate-limiting anything other than `POST /auth/demo`.
- Wiring the frontend Vitest/Storybook suite into CI (PROJECT.md Direction #1,
  a separate issue).
- Actually provisioning or deploying the demo host, DNS, or its Cloudflare
  record — this plan documents the deployment, it does not perform it.
