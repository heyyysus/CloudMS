# Implementation notes — issue #157

## Implemented

1. `organizations.reminder_timezone` (varchar(64), default `America/Chicago`)
   and `organizations.reminder_send_hour` (integer, default 9) —
   `backend/src/db/schema.ts`.
2. `planDueReminders` joins `organizations` and reads its two columns instead
   of `reminderConfig()`'s `timeZone`/`sendHour` — `backend/src/jobs/planner.ts`.
3. Dropped `timeZone`/`sendHour` from `ReminderConfig` and `reminderConfig()`
   — `backend/src/jobs/config.ts`.
4. `TestContext.org()` takes an overrides parameter (`Partial<NewOrganization>`)
   — `backend/src/routes/testHelpers.ts`.
5. Rewrote the two env-var test cases to set per-org columns via
   `ctx.org({...})`, and added `"honors each organization's own timezone and
   send hour"`: two orgs (`UTC`/9, `America/Chicago`/17), same rule shape,
   same expiration date, asserts `T09:00:00.000Z` vs `T22:00:00.000Z` and that
   they differ — `backend/src/jobs/reminders.test.ts`.
6. Removed `REMINDER_TIMEZONE`/`REMINDER_SEND_HOUR` from
   `backend/.env.example`.
7. `docs/multitenancy.md`: moved both vars from **Remains** to a **Done
   (#157)** sentence (no longer named there), reworded "iterates
   organizations" to "joins each rule to its organization's settings",
   updated rollout item 6, added a dated History entry (the one place the
   retired variable names are allowed).
8. `PROJECT.md`: **Not yet built** bullet now names only `MAIL_REPLY_TO`.

## Decisions

- Ran directly against the runner's own `myapp` Postgres database (via
  `npm run db:push`) rather than provisioning a private `myapp_157` database.
  CLAUDE.md's "Concurrent agents" section — the source of that private-db
  requirement — is explicitly out of scope for this run per the task
  instructions (isolated CI runner, no other agents sharing this Postgres).

## Deviations

None — implemented exactly what plan.md scoped.

## For the docs stage / reviewer

- `grep -rn "REMINDER_TIMEZONE\|REMINDER_SEND_HOUR" backend/ docs/` returns
  only the new dated History line in `docs/multitenancy.md`, which is the
  one place the plan allows the strings.
- No frontend change: `GET /auth/me` never exposed these columns, so nothing
  under `frontend/` was touched (confirmed via `git diff --stat` against
  `origin/main`).
- Left `REMINDER_HORIZON_DAYS`/`REMINDER_LOOKBACK_DAYS` as env vars per the
  plan's *Scope check* — operational, deployment-level tuning, not an
  agency-level setting.
- No check constraint added on `reminder_send_hour` (plan's open question) —
  deferred to the future settings-route issue where the value first becomes
  user-supplied, per the plan's recommendation.

## Checks run

All from `backend/`, against the runner's own Postgres (schema already
pushed with the new columns):

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run format:check` — pass
- `npx vitest run` — 479/479 tests pass (37 files), including the new
  per-org timezone/send-hour test
- `npm run build` — pass

No frontend checks run — no files under `frontend/` changed.

## Docs

No further doc changes needed. `docs/multitenancy.md` was already updated as
part of the implementation diff (Remains → Done (#157), History entry); no
API, auth, UI, or setup-step changes to reflect elsewhere, and README.md
doesn't enumerate individual env vars.
