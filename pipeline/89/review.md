# Plan review — issue #89

## Findings

- Issue #89's body is genuinely empty (confirmed by the empty issue body passed to this
  review), so the plan's central premise — that #89 is the umbrella issue for the
  already-merged #98/#100/#102 and reverted #99, and that "done" means closing out the
  remainder — cannot be verified against a stated acceptance criterion. The plan is explicit
  about this gap and front-loads it in *Risks / open questions* rather than hiding it, which
  is the right call for an empty issue rather than treating it as blocking.
- Spot-checked the plan's factual claims against `main` and they all hold: the commit chain
  (`86cc1f3` #98 → `c55c3c2` #102 → `37cf1ed` #99 → `ad5292a` revert of #99) is accurate;
  `backend/src/demo.ts`/`demo.test.ts` are indeed absent from `main` today (would come back
  via the revert); `backend/src/config.ts:12` is the single canonical `demoMode()` every
  other demo caller imports; `demoRowCeiling` is mounted on exactly the 9 non-auth create
  routes the plan lists, not the auth path; `frontend/src/lib/demo.ts:10-13`
  (`demoBannerText`) already handles an absent/zero `resetMinutes` gracefully, matching the
  plan's claim that the frontend needs no changes; `routes/config.test.ts` does assert the
  exact `{ demoMode: false }` body the plan promises to keep byte-identical.
- Item 2's reuse story checks out on inspection: `backend/package.json`'s `db:seed` resolves
  to `src/db/seed.ts`, which imports `seed()` from `src/db/seed/run.ts`, which calls `wipe()`
  first — so "one `seed()` call" is accurate, and the plan correctly flags the two-file
  naming trap as something the coder must confirm rather than assuming.
- The double-guard design for `demoReset.ts` (must be `demoMode()` *and* only reachable from
  the timer started under `demoMode()`) and the requirement to keep `seed`/`wipe` mocked in
  `demoReset.test.ts` (never a live wipe under vitest against the shared `myapp` DB) are
  correctly identified as the highest-risk part of this plan and are treated with
  appropriate weight — this is the one place a plan mistake would be irreversible.
- Scope is proportionate: item 1 restores previously-reviewed, reverted-for-sequencing code;
  items 2–4 are small, additive, and each has a stated fallback (e.g. cutting item 2 down to
  just the `demoResetMinutes` field plus documented manual reseed) if the coder judges the
  risk isn't worth it. No scope creep into frontend, schema, or unrelated auth flows — the
  "Out of scope" list is explicit about this.
- Rate limiter (item 3) is correctly scoped as a speed bump, not a security control, with the
  spoofable-header caveat called out for the PR description — appropriate given `trust
  proxy` isn't configured and the plan avoids turning it on globally.
- Direction fit: demo mode is enabling infrastructure for a public demo deployment under the
  "fully cloud-based" pillar, consistent with how the earlier #98/#102 plans were framed and
  approved; it doesn't compete with or reorder PROJECT.md's Direction list since it's not on
  it by design.
- Tests plan correctly uses `TestContext`/`makeSessionCookie` conventions from
  `testHelpers.ts`, avoids table truncation and global row-count assertions, and calls out
  cleanup by created-id rather than a `LIKE` pattern for the rate-limit test — matches
  CLAUDE.md's fixture guidance.

## Required changes (if rejected)

N/A

Verdict: approved
