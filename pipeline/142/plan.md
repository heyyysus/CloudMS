---
issue: 142
status: pending-review
---
# Rewrite PROJECT.md Current State against main

## Goal

Edit `PROJECT.md` so Current State and Direction match `main`, and fix the integer row ids in `docs/API.md`. Docs only, no code.

Done when:

1. Current State says orgs and memberships exist, every tenant table carries `org_id`, invoice/receipt numbering is per-org, and ids are opaque base64url strings.
2. Current State names the two isolation layers: `orgId` as every repository's first argument, Postgres RLS as the backstop, on the `DATABASE_URL` / `DATABASE_ADMIN_URL` split.
3. Current State names session-bound active org, the login org picker, and the sidebar switcher.
4. Direction item 2 is marked done (or dropped), leaving item 1 and items 3–6 as what remains.
5. `docs/API.md` examples show 22-character base64url ids instead of `1`, `104`, `155`.

## Scope check

Fits pillar 1 ("Fully cloud-based… an agency is an organization in the database"), and closes the bookkeeping on roadmap item 2. No pillar or roadmap item changes meaning — this is the roadmap catching up to the code.

Triage labels are right: `documentation`, `area:infra`, docs-only. Two corrections to the issue body, both verified against `main`:

- **The demo org does not exist.** `is_demo` is nowhere in `backend/src/db/schema.ts`; `docs/multitenancy.md:306` still lists "Demo org" as rollout item 8. The issue's claim that "all three exist" holds for `organizations` and `org_id`, not the demo org. The rewrite must keep "no demo org yet".
- **Automated email shipped too**, so Current State's "none of the AI or automated SMS/email features exist in code yet" (line 54) is false — see Approach step 3.

The orchestrator's note stands: `check-eligibility` will refuse this issue because its author is `app/github-actions`, not a CODEOWNER. That blocks the pipeline from running it, not the plan.

## Files / areas

| Path | Change |
| --- | --- |
| `PROJECT.md` | Current State (lines 20–54) and Direction (lines 56–65) |
| `docs/API.md` | 40 integer id values in JSON examples; the stale tenancy bullet at lines 21–30 |

Read-only evidence for the rewrite: `backend/src/db/schema.ts`, `backend/src/db/ids.ts`, `backend/src/db/pools.ts`, `backend/src/db/rls.ts`, `docs/multitenancy.md`.

## Approach

1. **Rewrite the multi-tenancy facts in Current State** (~15 min). Add an **Organizations** paragraph after **Domain model**: `organizations` (name, slug, `next_invoice_number`, `next_receipt_number`) and `org_memberships` (user + org + role, unique per pair) from `schema.ts:51-96`; `org_id` on every tenant table; carrier NAIC and policy number unique per org, not globally. State both isolation layers in the words CLAUDE.md uses: `orgId` first argument on every repository function (95 of them across 22 files in `backend/src/repositories/`), RLS as the backstop, `db` vs `adminDb` on the `DATABASE_URL` / `DATABASE_ADMIN_URL` split (`db/pools.ts:8-27`). Add one sentence on row ids: 128 random bits as unpadded 22-char base64url, DB-side and Drizzle-side defaults, no id leaks creation order or row count (`db/ids.ts`).

2. **Fix the three stale multi-tenancy sentences** (~5 min):
   - Line 50, Deployment: delete "Today the schema has no organization yet, so a deployment holds exactly one agency."
   - Line 54, Not yet built: delete the "Multi-tenancy is designed but not built…" sentence; replace with the one thing still missing — the demo org, plus the org creation/invite flow if it is also absent (grep for an invite route before asserting either way).
   - Line 26, the auth paragraph: add the session-bound active org, `SelectOrg` / `components/auth/org-picker.tsx` at login, and `components/layout/org-switcher.tsx` in the sidebar.

3. **Fix the email-automation claim** (~10 min). `backend/src/mailer.ts` sends through Resend; `backend/src/jobs/{planner,dispatcher,scheduler}.ts` plan and dispatch reminders with leader election and `SKIP LOCKED`; `email_templates`, `email_log`, `reminder_rules`, `scheduled_emails` are in the schema; routes are mounted in `app.ts:56-63`; the frontend has `ReminderRules.tsx` and `CorrespondenceTemplates.tsx`. Say that email reminders and templated correspondence ship today, SMS does not, and AI still does not. Then soften Direction item 5 to the remainder (SMS) rather than marking it done.

4. **Refresh the screens list** (~5 min). Current State lists only `/home` and `/clients/:clientId`. `frontend/src/pages/` also holds `Admin`, `ManageUsers`, `ManageCarriers`, `TrustAccounting`, `ReminderRules`, `CorrespondenceTemplates`, `SelectOrg`. Add them as one grouped line; do not expand into a screen-by-screen tour.

5. **Mark Direction item 2 done** (~2 min). Keep the line, prefix it with `**Done (#117, #119, #122, #130).**`, and list the one remainder (demo org) rather than deleting the item — the numbering in items 3–6 is referenced elsewhere in the pipeline.

6. **Fix `docs/API.md` examples** (~25 min). The Conventions bullet at lines 46-49 already documents base64url ids correctly; only the 40 JSON examples lag. Replace each integer with a plausible 22-char base64url string, reusing the same string for the same logical row across the file (one id for the Smoke client, one for its policy, and so on) so the cross-references in the examples still line up. While in that file, fix the tenancy bullet at lines 28-30 — "Logs, attachments, and accounting documents are not yet scoped" is false now, since `policyLogs.ts`, `policyAttachments.ts`, `invoices.ts`, `payments.ts`, and `receipts.ts` all take `orgId` first.

Total: about 1 hour.

## Tests

No test changes. Docs-only diff touches no backend source, so nothing runs against the database.

Verification before handing off:

1. `grep -n "no organization yet\|not built\|no \`organizations\` table" PROJECT.md` returns nothing.
2. `grep -nE '"[a-zA-Z]*[Ii]d": ?[0-9]+' docs/API.md` returns nothing.
3. Read the rewritten Current State against `docs/multitenancy.md` §Data model and §Rollout — every "built" claim must have a rollout item that is actually checked off there.

## Touches backend

No.

## Risks / open questions

1. **Scope of step 3 (email automation) is the reviewer's call.** It is outside the issue's stated acceptance, which is multi-tenancy only. Including it means the rewritten section is true; excluding it means shipping a "rewrite against main" that leaves a sentence contradicted by `backend/src/mailer.ts`. Recommend including. If the reviewer says no, cut steps 3 and 4 and file a follow-up issue instead.
2. **Org creation and invite flow** — not verified. Check for an invite route in `backend/src/routes/` before writing either "built" or "not built" in step 2.
3. **The 40 id examples must stay internally consistent.** A find-and-replace with random strings breaks the examples where a `clientId` in one block matches an `id` in another. Build the mapping first, then substitute.
4. **This issue cannot run through the pipeline as filed** (author not in CODEOWNERS). Someone has to re-file it under a CODEOWNER account or apply the patch by hand.

## Out of scope

- Any code change, including building the demo org or the invite flow.
- Rewriting `docs/multitenancy.md`, which is current.
- The Overview section's pillar text, which already describes multitenancy correctly.
- Reordering or renumbering Direction items 3–6.

**Next action:** decide risk 1 — does this PR also fix the email-automation sentence, or does that become a separate issue?
