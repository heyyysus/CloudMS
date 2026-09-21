# Plan review — issue #142

## Findings

- Scope matches the issue exactly: `PROJECT.md` Current State/Direction plus the `docs/API.md` id examples and stale tenancy bullet, docs-only, no backend touch. Spot-checked `backend/src/db/schema.ts` — `organizations` (`schema.ts:51`) and `org_memberships` (`schema.ts:79-96`) exist, `orgId` is on every tenant table checked (persons, clients, policyLogs, policyAttachments, email_templates, etc.), confirming the plan's core claim that "no organizations table, no org_id" is false today.
- The plan's two corrections to the issue body both check out against `main`: no `is_demo` column anywhere in `schema.ts`, and `docs/multitenancy.md:266-270` describes the demo org as still-designed, not built — so "no demo org yet" is correctly kept. The email-automation correction also holds: `backend/src/mailer.ts`, `backend/src/jobs/{planner,dispatcher,scheduler}.ts`, and the `emailTemplatesRouter`/`reminderRulesRouter` mounts in `app.ts:61-63` are all real, so leaving "no automated SMS/email exists" uncorrected would ship a doc that's still wrong.
- `docs/API.md`'s "Logs, attachments, and accounting documents are not yet scoped" (lines 28-30) is confirmed stale: `docs/multitenancy.md:288-292` marks that item done (#119, #120), and `policyLogs.ts:39`/`policyAttachments.ts:60-63` both filter on `orgId`. Plan step 6 is correct to fix it. Spot-checked several `"id": <int>` literals in `docs/API.md` (lines 85-247) — the integer-id problem is real and widespread, matching the plan's ~40 estimate.
- Two-layer isolation description (orgId-first-argument + RLS backstop, `db`/`adminDb` split) matches `backend/src/db/pools.ts:8-27` and the existence of `backend/src/db/rls.ts`.
- Direction item 2 being marked done (step 5) is right per PROJECT.md's own roadmap text and `docs/multitenancy.md`'s rollout list (items 1-5 and 9 done, items 6-8 remain) — the plan's residual (demo org) matches that doc.
- Tests section ("no test changes") is correct for a docs-only diff; nothing touches `backend/src/`, so no `TestContext` fixtures are needed.
- No security surface: doc/reference edits only, no auth, session, or secret-handling code touched.
- Risk 1 (whether to fold in the email-automation fix) is flagged for reviewer judgment rather than silently decided — reasonable, and the plan's default (include it) is the right call since excluding it would leave a doc contradicted by code the plan already inspected.
- The plan surfaces the CODEOWNERS blocker itself and doesn't let it affect scope — matches the orchestrator's note.

## Required changes (if rejected)

None.

Verdict: approved
