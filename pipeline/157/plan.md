---
issue: 157
status: pending-review
---
# Per-organization reminder timezone and send hour

## Goal

`planDueReminders` reads each organization's own timezone and send hour from
`organizations`, and `REMINDER_TIMEZONE` / `REMINDER_SEND_HOUR` no longer
exist.

Done means:

1. `organizations` has `reminder_timezone varchar(64) NOT NULL DEFAULT
   'America/Chicago'` and `reminder_send_hour integer NOT NULL DEFAULT 9`, so
   every existing org keeps today's behavior after `db:push`.
2. A test proves two orgs with the same rule shape and the same policy
   expiration date get different `scheduled_for` instants — one on `UTC`/hour
   9, one on `America/Chicago`/hour 17. That is the thing the env vars made
   impossible.
3. `grep -rn "REMINDER_TIMEZONE\|REMINDER_SEND_HOUR" backend/ docs/` returns
   nothing outside a history note.
4. `npx vitest run` green against a private database (not shared `myapp` —
   this changes the schema).

## Scope check

PROJECT.md *Direction* item 2, **Not yet built** → "Organization settings
columns, to retire the last agency-level environment variables … together with
per-organization scoping of the reminder planner". `docs/multitenancy.md`
rollout item 6 records the same remainder. After this, only `MAIL_REPLY_TO` is
left of that item (filed separately).

Triage labels look right: `area:backend` (nothing under `frontend/` changes),
`enhancement`, `risk:high` — the change edits schema and the one SQL statement
that queues every agency's email, so a mistake either queues nothing or queues
at the wrong hour for every tenant.

Agreeing with the issue's *Out of scope* on the planning window:
`REMINDER_HORIZON_DAYS` / `REMINDER_LOOKBACK_DAYS` stay in the environment.
They tune how much outage the planner recovers from — an operational property
of the deployment, not something an agency would ever set — and unlike the send
hour they are invisible in the output. `docs/multitenancy.md` line 236 lists
them next to the settings; the docs edit in step 5 separates the two.

## Files / areas

| Path | Change |
| --- | --- |
| `backend/src/db/schema.ts` | two columns on `organizations` (after `nextReceiptNumber`, line 56) |
| `backend/src/jobs/planner.ts` | join `organizations`, use its columns (lines 52-57) |
| `backend/src/jobs/config.ts` | drop `timeZone` / `sendHour` from `ReminderConfig` and `reminderConfig()` (lines 14-15, 28-29) |
| `backend/src/routes/testHelpers.ts` | `ctx.org()` takes overrides (line 136) |
| `backend/src/jobs/reminders.test.ts` | rewrite the two env-var cases (lines 209-257), add the two-org case |
| `backend/.env.example` | remove both vars (lines 33-35) |
| `docs/multitenancy.md` | settings section (230-246) and rollout item 6 (300-304) |
| `PROJECT.md` | **Not yet built** bullet (line 66) |

No frontend change: `GET /auth/me` returns `{ id, name, slug }` picked by hand
(`backend/src/auth/routes.ts:36`), so the new columns are not exposed anywhere.

## Approach

1. **Schema.** Add to `organizations` in `schema.ts`:

   ```ts
   reminderTimezone: varchar("reminder_timezone", { length: 64 })
     .notNull()
     .default("America/Chicago"),
   reminderSendHour: integer("reminder_send_hour").notNull().default(9),
   ```

   `varchar` and `integer` are already imported. `Organization` /
   `NewOrganization` in `backend/src/types/index.ts` are `$inferSelect` /
   `$inferInsert`, so they pick the columns up with no edit. `organizations` is
   deliberately not RLS-protected (`backend/src/db/rls.ts:54`), so `rls.ts`
   needs no change either. Leave `seedOrganizations` and `bootstrap.ts` alone —
   the column defaults are what they would write.

2. **Planner.** In `planDueReminders`, add the join next to the existing
   `auto_policies` one and swap the two interpolations:

   ```sql
   (((p.expiration_date - r.offset_days) + make_interval(hours => o.reminder_send_hour))
     at time zone o.reminder_timezone) at time zone 'UTC'
   ...
   join organizations o on o.id = r.org_id
   ```

   Three things stay exactly as they are: the second `at time zone 'UTC'` (it
   is the storage conversion, not a setting), `for share of r` (it names `r`
   only, so the new join is not locked), and the `orgId` narrowing clause. An
   inner join is right — `reminder_rules.org_id` is `NOT NULL` with an FK, so
   every rule has exactly one org row.

3. **Config.** Delete `timeZone` and `sendHour` from the `ReminderConfig`
   interface and the `reminderConfig()` return, and the comment above
   `timeZone` explaining `AT TIME ZONE` (that reasoning now lives in the
   planner's existing comment at lines 46-51). `planner.ts` is the only reader
   of either field — everything else in the file is scheduler pacing and stays.

4. **Test helper.** Give `TestContext.org()` an overrides parameter so a test
   can create an org with settings, matching how `client()` / `policy()` /
   `reminderRule()` already take overrides:

   ```ts
   async org(overrides: Partial<NewOrganization> = {}): Promise<Organization> {
     const [o] = await adminDb.insert(organizations).values({
       name: unique("Test Org "), slug: unique("test-org-").slice(0, 64), ...overrides,
     }).returning()
   ```

   Existing call sites pass nothing and are unaffected. Because `org()` sets
   `defaultOrgId ??= o.id`, a test that calls it first gets its settings used
   by `dueSetup()` and every other default-org fixture — no second helper
   needed.

5. **Docs.** In `docs/multitenancy.md`, move `REMINDER_TIMEZONE` /
   `REMINDER_SEND_HOUR` out of **Remains** into the **Done** sentence
   *without naming them* (criterion 3 forbids the strings outside history):
   "**Done (#157):** per-organization reminder timezone and send hour columns,
   read by the planner." Keep `MAIL_FROM` / `MAIL_REPLY_TO` in **Remains**, and
   state the planning window's env-only rationale from *Scope check* above.
   Reword line 246 — the planner joins each organization's settings, it does
   not "iterate organizations". Same treatment for rollout item 6. Add the
   dated History entry that names the retired variables, which is the one place
   the strings are allowed. In `PROJECT.md`, line 66 keeps only
   `MAIL_REPLY_TO`.

## Tests

`backend/src/jobs/reminders.test.ts`, three cases:

1. **"schedules the send at the organization's local hour"** (line 209) —
   replace the two `process.env` lines with
   `await ctx.org({ reminderTimezone: "UTC", reminderSendHour: 9 })` before
   `dueSetup`, which then plans against that org. Assertion unchanged.
2. **"tracks DST …"** (line 224) — same swap to
   `{ reminderTimezone: "America/Chicago", reminderSendHour: 9 }`.
   `REMINDER_HORIZON_DAYS = "400"` stays; it is still an env var.
3. **New: "honors each organization's own timezone and send hour"** — the
   acceptance criterion. Model it on "never joins a rule to another
   organization's policy" (line 263): two `ctx.org()` calls, one
   `{ reminderTimezone: "UTC", reminderSendHour: 9 }` and one
   `{ reminderTimezone: "America/Chicago", reminderSendHour: 17 }`, each with
   its own client + email + active policy + rule at the same `freeOffset()`,
   both expirations built from the same target date so the only difference is
   the org. Set `REMINDER_HORIZON_DAYS = "400"` and take the target from
   `nextOccurrence(7, 1)` so the date is always a future summer day (CDT,
   UTC-5) and the expected instants are exact: `T09:00:00.000Z` for the UTC org
   and `T22:00:00.000Z` for the Chicago one. Assert both, and assert they
   differ.

Also update the file's header comment (line 9) — it says a parallel planner run
would stamp a row "with its own timezone env", which stops being true.

Run, per CLAUDE.md *The Postgres container is shared* — this changes the
schema, so `db:push` must not touch `myapp`:

```
docker compose exec -T db createdb -U postgres myapp_157
cd backend
export DATABASE_ADMIN_URL=postgresql://postgres:password@localhost:5433/myapp_157
export DATABASE_URL=postgresql://app:password@localhost:5433/myapp_157
npm run db:push && npm run db:bootstrap && npx vitest run
npm run typecheck && npm run lint && npm run format:check
docker compose exec -T db dropdb -U postgres myapp_157
```

Then `grep -rn "REMINDER_TIMEZONE\|REMINDER_SEND_HOUR" backend/ docs/` for
criterion 3. No frontend change, so no frontend run.

About 45 minutes: the planner edit is four lines, the test work is most of it.

## Touches backend

yes

## Risks / open questions

1. **A bad value in one org's column breaks planning for every org.** The
   planner is one `INSERT ... SELECT` across all tenants, so an unrecognized
   IANA zone or an hour outside 0-23 raises and the whole tick plans nothing,
   not just that agency's rules. Nothing writes these columns today except
   `db:push` defaults, so the risk is latent until a settings route lands —
   **open question: add `check (reminder_send_hour between 0 and 23)` now?**
   `schema.ts` uses no check constraints today; `db:push --force` would apply
   it. Recommendation: skip it in this issue and make it the settings route's
   job, where the value first becomes user-supplied and can be rejected with a
   `400`.
2. **Production DDL is automatic.** `backend/Dockerfile`'s CMD runs
   `drizzle-kit push --force` before starting, and both columns are `NOT NULL
   DEFAULT`, so deploying is an additive `ALTER TABLE` with no manual step and
   no downtime on a table this small.
3. **Rows already queued keep their old instant.** `scheduled_for` is computed
   at plan time, so anything queued before the deploy (up to
   `REMINDER_HORIZON_DAYS`, default 7) sends at the hour the env vars produced.
   Identical for every org today because the defaults match the env values, so
   nothing to migrate; worth remembering when the settings route makes the
   columns editable.

## Out of scope

- **An API or admin UI to edit the settings** — its own issue. `db:push`
  defaults are the only writer.
- **`MAIL_REPLY_TO`** — the other half of rollout item 6, filed separately
  because it edits the same `organizations` block.
- **The planning window** (`REMINDER_HORIZON_DAYS`, `REMINDER_LOOKBACK_DAYS`)
  stays in the environment; see *Scope check*.
- **`MAIL_FROM`** and the rest of `reminderConfig()` (tick, batch size, max
  attempts, claim timeout) stay process-wide.
