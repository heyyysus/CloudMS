# Plan review — issue #83

## Findings

- Scope matches the issue exactly: README.md only, one `## Agent pipeline` section, no
  code changes. Plan explicitly lists out-of-scope items (editing the script, the
  workflows, `pipeline/README.md`, or `PROJECT.md`) that keep it from creeping.
- Correctly catches and fixes a real bug in the issue text: the issue says
  `.claude/pipeline/README.md`, but that path was moved to `pipeline/README.md` in PR #85
  (commit f56847a). `.claude/pipeline/` no longer exists — verified. Linking the real path
  and flagging the discrepancy rather than silently choosing is the right call.
- Placement claim verified: `README.md` does have `## Before opening a PR` (line 88)
  immediately followed by `## Deployment` (line 111), so inserting the new section
  between them is accurate and consistent with the README's existing setup → run →
  pre-PR → deploy ordering.
- Referenced paths verified to exist: `pipeline/README.md` and
  `scripts/setup-pipeline-labels.sh` both resolve.
- Label names verified: `agent`, `pipeline:*` (all listed variants),
  `needs-human`, `agent:deep-review`, and `area:*` all appear in
  `scripts/setup-pipeline-labels.sh`.
- Secret names verified against `pipeline/README.md`'s "Setup (once)" section:
  `CLAUDE_CODE_OAUTH_TOKEN` and `PIPELINE_BOT_TOKEN` match; plan correctly avoids
  duplicating the detail behind them (PAT scopes, etc.) and just points to the source doc.
- Direction: reasonably argues this sits outside PROJECT.md's five product pillars as
  contributor/repo tooling, but is legitimate housekeeping since #82/#85 added the
  pipeline without ever wiring it into the top-level README. Doesn't misrepresent it as
  product work.
- No tests needed and none proposed, correctly reasoned: README.md is outside both
  `ci.yml`'s path-filter and `frontend.yml`'s trigger path, so no CI job would even run.
  Manual verification steps (grep the labels, ls the linked paths) are appropriately
  lightweight for a docs-only change.
- Security: no auth/session/input-validation/secrets-value surface here — the plan only
  names secret *identifiers* already public in `pipeline/README.md`, never values. No
  concerns.
- Conventions: nothing in CLAUDE.md bears on a docs-only README edit (the concurrent-agents
  section is explicitly out of scope for this review per instructions).

Verdict: approved
