# Plan review — issue #137

## Findings

- `agent-planner.yml:112` already has `model: opus` — plan correctly treats the issue's
  planner bullet as a no-op instead of inventing an edit. Verified directly.
- `agent-pr-review.yml` line refs check out: model step 63-67, diff cap `head -n 6000` at
  58, header comment 3-6, prompt checks 90-112. `agent-coder.yml:132-134` confirms the
  `workflow-changes.patch` escape hatch the plan relies on for the coder step.
- Doc edits are correctly scoped: `pipeline/README.md:13` (diagram), `:38` (label bullet),
  `:56-57` (Costs paragraph), and `scripts/setup-pipeline-labels.sh:12` all currently say
  what the plan claims and need the described change; root `README.md:134` only names the
  label and rightly needs no edit.
- The job-level `env` context limitation the plan cites (can't reference `env.DEEP` in
  `jobs.<job_id>.timeout-minutes`, hence repeating the `contains(...)` expression) is a
  real GitHub Actions constraint, not an invented workaround.
- Repointing `agent:deep-review` to a depth switch (turns/timeout/diff-cap/prompt) rather
  than removing it satisfies the issue's "still means something specific" requirement, and
  the plan documents the alternative (removal) with an effort estimate if the coder should
  go that way instead.

No scope creep: coder and triage are untouched, and the README/label-script edits are
required by the issue's own acceptance criteria, not drive-by. No security surface here —
CI YAML only, no auth/session/secrets handling changed.

## Required changes (if rejected)

N/A — plan approved.

Verdict: approved
