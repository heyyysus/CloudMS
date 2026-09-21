# Implementation notes — issue #142

Rewrote `PROJECT.md`'s Current State/Direction and fixed `docs/API.md`'s
stale tenancy bullet and integer id examples, per `pipeline/142/plan.md`.
Docs-only; no backend/frontend code touched.

## Implemented

1. `PROJECT.md` Current State: added an **Organizations** paragraph (org
   table, memberships, `org_id` on every tenant table, the two isolation
   layers, opaque base64url row ids), documented the login org picker
   (`SelectOrg`) and sidebar switcher, added the missing screens
   (`Admin`, `ManageUsers`, `ManageCarriers`, `TrustAccounting`,
   `ReminderRules`, `CorrespondenceTemplates`) to the screens list, added
   `emailTemplates`/`emailLog`/`reminderRules`/`scheduledEmails` to the
   domain model with a sentence on what ships (Resend-backed automated
   email, admin-authored correspondence) vs. what doesn't (SMS, AI).
2. Fixed the three stale sentences: dropped "no organization yet" from
   Deployment, replaced the "multi-tenancy designed but not built" claim
   in Not yet built with the two things that actually remain (org
   creation/invite flow, demo org), marked Direction item 2
   `**Done (#117, #119, #122, #130).**` with its remainder called out,
   softened Direction item 5 to SMS-only (email is done).
3. `docs/API.md`: rewrote the stale tenancy bullet (logs/attachments/
   accounting were said to be unscoped; #119/#120 scoped all of them).
4. `docs/API.md`: replaced every integer row-id literal (~45 across 13
   JSON examples plus a few inline URLs/prose) with a 22-char base64url
   string, reusing the same string for the same numeric id everywhere it
   recurred so cross-references in the examples still line up (e.g.
   client 155 / policy 104 / carrier 140 each map to one fixed string
   throughout). Left `invoiceNumber`, `receiptNumber`, and `logNumber`
   alone — those are genuinely plain per-org integers, not row ids.

## Decisions

- Included the email-automation correction (risk 1 in plan.md) rather
  than filing a follow-up: `backend/src/mailer.ts` and the
  planner/dispatcher/scheduler jobs are real and mounted in `app.ts`, so
  leaving the old sentence in would ship a doc contradicted by the code
  it's about.
- Verified there is no org-creation route (only `POST /users/invite`,
  which invites a user into an *existing* org) and no `is_demo` column,
  confirming rollout items 7 and 8 in `docs/multitenancy.md` are still
  open — these are the two things named as remaining under Direction
  item 2 and in Not yet built.

## Deviations

None — implemented exactly what plan.md scoped.

## For the docs stage / reviewer

- Read `docs/multitenancy.md` §Rollout order against the rewritten
  Current State: every "built" claim here (org table, memberships,
  per-repo `orgId`, RLS, base64url ids, per-org invoice/receipt numbers,
  email automation) has a corresponding Done item there (#117/#119/#120/
  #121/#122/#130); items 6 (org settings, partial), 7 (org creation/
  invite), and 8 (demo org) are the only gaps, and both are named as
  remaining rather than claimed done.
- The generated base64url ids in `docs/API.md` are illustrative only
  (freshly random, not pulled from a real row) — fine for docs, but if a
  future change wants ids to look "issued in order" for a demo dataset,
  these aren't that.

## Checks run

- `grep -n "no organization yet\|not built\|no \`organizations\` table" PROJECT.md` → no matches.
- `grep -nE '"[a-zA-Z]*[Ii]d": ?[0-9]+' docs/API.md` → no matches.
- Parsed all 13 JSON code blocks in `docs/API.md` with `JSON.parse` → all valid.
- No backend/frontend files touched, so backend/frontend typecheck/lint/test/build were not run (docs-only diff, no test changes per plan.md).
