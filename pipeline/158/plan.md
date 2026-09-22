---
issue: 158
status: pending-review
---
# Per-organization mail reply-to replaces MAIL_REPLY_TO

## Goal

`grep -rn "MAIL_REPLY_TO" backend/` returns nothing, and every send takes its
reply-to from the sending organization's new `organizations.mail_reply_to`
column.

Done means all four of the issue's acceptance criteria hold:

1. No `MAIL_REPLY_TO` anywhere under `backend/` (a dated History line in
   `docs/multitenancy.md` is the one allowed mention, same as #157).
2. An org with `mail_reply_to = null` sends a Resend body with **no**
   `reply_to` key — not `""`.
3. Two orgs with different `mail_reply_to` values produce different `reply_to`
   values through the same code path, asserted by a test.
4. `npx vitest run` green against the runner's own database.

## Scope check

PROJECT.md **Direction** item 2 (*multitenancy, mostly done*) and its
**Not yet built** bullet: "Organization settings columns, to retire the last
agency-level environment variable — `MAIL_REPLY_TO`."
`docs/multitenancy.md` rollout item 6 records the same remainder, now reading
"Only `MAIL_REPLY_TO` remains" after #157. This issue closes item 6.

Triage labels look right: `area:backend` (nothing under `frontend/` changes —
no API exposes the column yet), `enhancement`, `risk:high` because it is a
schema change plus a change to every outbound send path.

`MAIL_FROM` and `RESEND_API_KEY` stay process-wide by design —
`docs/multitenancy.md`: "Outbound email sends from a shared platform domain
with the agency's reply-to; per-agency sending domains are a later problem."

## Files / areas

| Path | Change |
| --- | --- |
| `backend/src/db/schema.ts` | `mailReplyTo: varchar("mail_reply_to", { length: 255 })` on `organizations`, **nullable, no default** |
| `backend/src/mailer.ts` | `SendEmailInput.replyTo?: string`; delete the `process.env.MAIL_REPLY_TO` read (line 49) |
| `backend/src/emails.ts` | new `orgReplyTo(orgId)` helper; both `sendEmail` calls (lines 99, 274) pass it |
| `backend/src/routes/mail.ts` | one-off send (line 65) passes the org's reply-to |
| `backend/src/jobs/config.ts` | `agencyIdentity` returns `org.mailReplyTo ?? ""`, parameter type widened |

Plus: `backend/.env.example` (drop the var and its comment line),
`backend/src/mailer.test.ts`, `backend/src/routes/mail.test.ts`,
`docs/multitenancy.md`, `PROJECT.md`.

## Approach

1. **Schema.** Add `mailReplyTo: varchar("mail_reply_to", { length: 255 })`
   to the `organizations` block in `backend/src/db/schema.ts`, after
   `reminderSendHour` (schema.ts:60). **No `.notNull()`, no `.default()`** —
   #157's two columns next to it are `NOT NULL DEFAULT`; do not copy that
   shape. Null is the "org has not set one" state that reproduces today's
   unset-env behavior. `Organization` / `NewOrganization` in
   `src/types/index.ts` are `$inferSelect`/`$inferInsert`, so they pick the
   field up with no edit.

2. **Mailer.** In `backend/src/mailer.ts`, add `replyTo?: string` to
   `SendEmailInput` (with a comment matching the existing `cc` one: emitted
   only when present). Delete `const replyTo = process.env.MAIL_REPLY_TO` and
   read `input.replyTo` in the existing
   `...(replyTo ? { reply_to: replyTo } : {})` spread — the conditional spread
   already gives criterion 2, so keep it exactly as is. Adjust the file's
   header comment, which still claims config comes from `process.env` per
   call; `RESEND_API_KEY`/`MAIL_FROM` still do, reply-to no longer does.

3. **One resolver, three call sites.** Add to `backend/src/emails.ts`:

   ```ts
   // The sending organization's reply-to, or undefined when it has not set
   // one - mailer.ts then omits reply_to entirely, which is what an unset
   // MAIL_REPLY_TO did before #158.
   export async function orgReplyTo(orgId: string): Promise<string | undefined> {
     const org = await findOrganizationById(orgId)
     return org?.mailReplyTo ?? undefined
   }
   ```

   `findOrganizationById` already exists in
   `src/repositories/organizations.ts` and takes the id directly (no RLS
   concern: `organizations` is not an RLS-protected table, and all three call
   sites run inside an org context anyway — `requireAuth` for the routes,
   `runInOrg` in the dispatcher).

   Wire it in at the three sites, each of which already has an `orgId` in
   scope:
   - `emails.ts:99` — `sendWelcomeEmail(orgId, ...)`: `replyTo: await orgReplyTo(orgId)`.
   - `emails.ts:274` — `sendCorrespondenceEmail({ orgId, ... })`: same.
   - `routes/mail.ts:65` — free-text send: `replyTo: await orgReplyTo(req.orgId!)`.

   Resolve inside `sendCorrespondenceEmail` rather than adding an optional
   `replyTo` to its input: `jobs/dispatcher.ts:127` already loaded the org and
   will pay one redundant primary-key read per automated send, which is
   cheaper than a parameter a future caller can silently forget and thereby
   send with no reply-to.

4. **`agencyIdentity`.** In `backend/src/jobs/config.ts:45`, widen the
   parameter to `org: { name: string; mailReplyTo: string | null }` and return
   `email: org.mailReplyTo ?? ""`. #157 already made this take the whole
   organization, so `dispatcher.ts:130`'s `agencyIdentity(org)` call needs no
   change. Update the trailing "keeping this module env-only otherwise" line
   in its comment — after this the function reads no env at all. `""` (not
   `undefined`) stays the empty case because `{{agentEmail}}` renders into a
   template string.

5. **Env + docs.** Remove `MAIL_REPLY_TO=...` and its `# Optional: address
   client replies...` comment from `backend/.env.example` (lines 23-24);
   leave `MAIL_FROM`. In `docs/multitenancy.md`: move `MAIL_REPLY_TO` out of
   **Remains** into a **Done (#158)** sentence, mark rollout item 6 done, and
   add a dated History entry — the one place the retired name may appear.
   In `PROJECT.md`, delete the "Organization settings columns" bullet from
   **Not yet built** (nothing remains under it) and drop `MAIL_REPLY_TO` from
   Direction item 2's leftovers.

6. **Schema against your own database**, never the shared `myapp`:

   ```
   docker compose exec -T db createdb -U postgres myapp_158
   cd backend
   export DATABASE_ADMIN_URL=postgresql://postgres:password@localhost:5433/myapp_158
   export DATABASE_URL=postgresql://app:password@localhost:5433/myapp_158
   npm run db:push && npm run db:bootstrap && npx vitest run
   ```

   Drop it at the end: `docker compose exec -T db dropdb -U postgres myapp_158`.

Estimate: about 45 minutes, most of it the two new tests and the docs pass.

## Tests

1. `backend/src/mailer.test.ts` — rename "includes reply_to when
   `MAIL_REPLY_TO` is set" (line 69) to "includes reply_to when the caller
   passes one", dropping the `process.env.MAIL_REPLY_TO` line and passing
   `replyTo: "agency@example.com"` instead. Add a case asserting
   `body.reply_to` is absent (`expect("reply_to" in body).toBe(false)`, which
   `toBeUndefined()` would not distinguish from an explicit `null`) when no
   `replyTo` is passed — criterion 2 at the unit level.
2. `backend/src/routes/mail.test.ts` — the criterion 3 test, in the existing
   `POST /clients/:clientId/send-email` describe, reusing its `stubResend`
   helper (line 32) and `TestContext`: two orgs via
   `ctx.org({ mailReplyTo: "a@example.com" })` and
   `ctx.org({ mailReplyTo: "b@example.com" })`, an admin, client and on-file
   email in each, one POST per org with that org's `ctx.cookie(user.id, orgId)`,
   then assert the two captured request bodies' `reply_to` are
   `"a@example.com"` / `"b@example.com"` and differ.
3. Same file — a third org left at `mailReplyTo: null` sends with no
   `reply_to` key, so criterion 2 is covered end-to-end through a real row and
   not only in the mailer unit test.
4. Worth adding while you are here: an assertion in
   `backend/src/jobs/reminders.test.ts` that an automated send renders
   `{{agentEmail}}` from the org's `mail_reply_to`. No test covers
   `agencyIdentity`'s email today, and this is the path that changes meaning.
5. Run from `backend/` against `myapp_158`: `npx vitest run`, plus
   `npm run typecheck`, `npm run lint`, `npm run format:check`,
   `npm run build`. No frontend checks — nothing under `frontend/` changes.

`TestContext.org()` already takes `Partial<NewOrganization>` (#157 added it),
so no test-helper change is needed. Fixtures carry unique suffixes and
`ctx.cleanup()` removes only this context's rows — do not truncate, do not
assert global counts.

## Touches backend

yes

## Risks / open questions

1. **Deploy order.** The column must exist before the new code runs, or every
   send throws on a missing column. Same shape as #157's deploy, which pushed
   schema ahead of the container; no new mechanism, but call it out in the PR
   body.
2. **Silent behavior change for existing orgs.** After deploy, every org has
   `mail_reply_to = null`, so sends that previously carried the deployment's
   `MAIL_REPLY_TO` will carry none until someone backfills. There is no UI or
   API to set it (out of scope, its own issue), so the backfill is a manual
   `UPDATE organizations SET mail_reply_to = '<old MAIL_REPLY_TO>'` on
   production. **Recommendation: put that exact statement in the PR body**
   rather than adding a data migration, since the correct value lives only in
   the production `.env`.
3. `{{agentEmail}}` on an automated reminder send renders `""` for an org with
   no reply-to — it already did whenever `MAIL_REPLY_TO` was unset, so this is
   not new, but item 2's backfill is what keeps it non-empty in production.
4. **Open question, non-blocking:** no format validation on the column. A
   `CHECK` for an `@` is tempting, but the value is not user-supplied until
   the settings-route issue exists; #157 deferred its `reminder_send_hour`
   constraint for the same reason. Recommend deferring, consistent with that.

## Out of scope

- An API or admin UI to edit `mail_reply_to` — its own issue, per the issue body.
- `MAIL_FROM` / `RESEND_API_KEY` and per-agency sending domains — platform-level
  by design.
- Any frontend change: no endpoint returns the column, so nothing to render.
- Validation/`CHECK` constraints on the column (risk 4).
