# Plan review — issue #157

## Findings

- Scope matches the issue exactly: two columns, planner join swap, config
  cleanup, env/docs cleanup, tests. No settings API or `MAIL_REPLY_TO` creep —
  both correctly deferred (plan `## Out of scope`).
- Direction matches PROJECT.md `Direction` item 2 / rollout item 6 in
  `docs/multitenancy.md:300-304` verbatim; defaults preserve today's
  process-wide behavior for every existing org.
- Soundness checks out against the actual files:
  - `backend/src/db/schema.ts:51-59` — `organizations` table and
    `nextReceiptNumber` line match; new columns slot in as described.
  - `backend/src/db/rls.ts:44-54` — `organizations` is confirmed exempt from
    RLS, so the plan's "no `rls.ts` change" claim is correct.
  - `backend/src/jobs/planner.ts:34-77` — `cfg.sendHour`/`cfg.timeZone`
    interpolation sites and the `auto_policies` join line up with the planned
    edit; `for share of r` names only `r`, so adding the `organizations` join
    doesn't change lock scope as claimed.
  - `backend/src/jobs/config.ts:12-40` — `timeZone`/`sendHour` are the only
    two fields being removed; everything else in `ReminderConfig` is
    scheduler pacing, matching the plan's rationale for what stays.
  - `backend/src/routes/testHelpers.ts:136-157` — `org()` takes no overrides
    today and sets `defaultOrgId ??=`, exactly as the plan describes; adding
    an overrides parameter is a small, consistent change.
  - `backend/src/jobs/reminders.test.ts:209-257` — the two env-var cases are
    at the claimed lines and read cleanly onto `ctx.org({...})`.
  - `backend/.env.example:34-35`, `docs/multitenancy.md:230-246,300-304` —
    both variables and both doc sections are exactly where the plan says.
- Tests: uses `TestContext` fixtures throughout, models the new two-org case
  on the existing cross-tenant test, and asserts the acceptance criterion
  (different `scheduled_for` instants) directly. Correctly plans to run
  against a private database per CLAUDE.md, since this is a schema change.
- Security: no new input surface — only `db:push` defaults write these
  columns until a settings route exists, so there's no injection or exposure
  risk yet. The plan's own risk section calls out the right future work (a
  bad IANA zone or out-of-range hour breaking planning for every org) and
  reasonably defers a check constraint to the settings-route issue, where the
  value first becomes user-supplied.
- Conventions: nothing in CLAUDE.md is violated; `docs/multitenancy.md` and
  `PROJECT.md` updates are in scope for this change and listed in the file
  table.

## Required changes (if rejected)

N/A

Verdict: approved
