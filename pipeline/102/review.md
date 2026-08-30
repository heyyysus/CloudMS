# Plan review — issue #102

## Findings

- Scope matches the issue precisely: body cap (all modes) + per-table row ceiling (demo mode
  only) on the same eight create routes the issue lists, explicitly skipping attachments,
  admin/tiny tables, and child/bulk POSTs for the same reasons the issue gives. Nothing extra
  (no nginx rate limiting, no per-IP quotas) — matches "Out of scope."
- Direction: correctly scoped as demo-infrastructure hardening rather than a product-pillar
  change; PROJECT.md's roadmap doesn't mention this and the plan doesn't pretend it does.
  Reasonable to land ahead of #101 as the issue allows.
- Soundness — spot-checked and all claims hold:
  - `backend/src/app.ts:40` is `app.use(express.json())`, error handler at lines 79–97 only
    branches on `err.code`/`err.cause.code` (Postgres codes) and falls through to a bare 500,
    confirming the plan's central correction that the issue's "Express returns 413
    automatically" claim is wrong for this app. The proposed status-based branch is a sound,
    minimal fix and preserves the `{ error }` shape every route uses.
  - `backend/src/config.ts` and `backend/src/middleware/` genuinely don't exist yet on `main`
    — confirms the plan's dependency analysis on unmerged `#98`, and the fallback ("create
    config.ts matching #98's shape if it isn't there") is a reasonable hedge against merge
    order.
  - Route line numbers verified: `persons.ts:31`, `carriers.ts:37` (already
    `requireAuth, requireRole("admin"), handler` multi-arg, confirming the "mount after both"
    instruction is safe here).
  - `count(*)` pattern precedent at `repositories/policyAttachments.ts:79-81` (`Number(count)`
    coercion) matches what the plan proposes to reuse.
  - `auth/middleware.ts` confirms the `res.status().json(); return` (not `return res...`)
    convention the plan calls out.
- Tests: uses `TestContext` for the one fixture it needs (a `persons` row) and explicitly
  avoids the issue's racy "current count + 1" approach in favor of bracketing ceilings
  (`1` / `1_000_000`) that assert no global row count — directly follows CLAUDE.md's
  concurrency rule, better than the issue's own test suggestion.
- Security: row ceiling is mounted after `requireAuth`/`requireRole` so it can't be used to
  probe table sizes pre-auth; demo-mode-only gating means zero behavior change in production
  except the (justified, called-out) body-cap and error-handler tightening. No secrets or new
  data exposure. 429 message doesn't leak the actual count.
- Minor, non-blocking: the error-handler broadening to all 4xx `err.status` (not just 413)
  changes malformed-JSON responses from 500→400 — the plan flags this itself as a second
  behavior change to mention in the PR description, and offers a narrower fallback
  (`err.type === "entity.too.large"` only) if a reviewer wants smaller blast radius. Fine to
  leave to the coder/reviewer's judgment as written.

## Required changes (if rejected)

N/A

Verdict: approved
