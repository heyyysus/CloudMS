# Implementation notes — issue #83

## What was implemented

Added a `## Agent pipeline` section to `README.md`, inserted between `## Before opening
a PR` and `## Deployment`, exactly as scoped in `plan.md`. No other files changed.

The section:

- Explains that CODEOWNER issues labelled `agent` run through an unattended
  planner → plan review → coder → docs → PR → PR review pipeline, with merging the PR
  as the only human gate, and that per-issue artifacts land under
  `pipeline/<issue-number>/` on `agent/issue-<n>`.
- Links `[pipeline/README.md](./pipeline/README.md)` (not the stale
  `.claude/pipeline/README.md` path from the issue body — that directory no longer
  exists after PR #85) as the full reference.
- Documents `scripts/setup-pipeline-labels.sh`: usage (`[owner/repo]` arg, defaults to
  current repo), that it's idempotent (`gh label create --force`), which labels it
  manages (`agent`, `pipeline:*`, `needs-human`, `agent:deep-review`, `area:*`), that it
  needs `gh` authenticated with label-write access, and that it's a one-time setup step
  per repo/fork.
- Names the two required secrets (`CLAUDE_CODE_OAUTH_TOKEN`, `PIPELINE_BOT_TOKEN`) and
  points to `pipeline/README.md`'s "Setup (once)" section for detail, rather than
  duplicating it.

## Deviations from the plan

None. Followed the plan's placement, content, and length guidance as written.

## Verification performed

Docs-only change to `README.md`, which is outside both `ci.yml`'s path-filter and
`frontend.yml`'s trigger path — no CI job runs for this diff, matching the plan's "Tests"
section. Manual checks run instead:

- `ls pipeline/README.md scripts/setup-pipeline-labels.sh` — both paths resolve.
- Grepped `agent`, `pipeline:`, `needs-human`, `agent:deep-review`, `area:` against
  `scripts/setup-pipeline-labels.sh` — every label name used in the new README section
  is present in the script.
- Re-read the rendered section for heading level (`##`, matching `pipeline/README.md`'s
  h1) and link style (relative Markdown links, consistent with the rest of `README.md`).

No backend or frontend code was touched, so `npm run typecheck/lint/format:check/test/
build` (backend) and `npm run lint/build` (frontend) were not run — nothing in those
trees changed.
