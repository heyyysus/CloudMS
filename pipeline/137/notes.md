# Coder notes — issue #137

## Implemented

1. `pipeline/137/workflow-changes.patch` — the `.github/workflows/agent-pr-review.yml`
   edit, saved as a patch because this runner's token can't push workflow files. **A
   human must `git apply pipeline/137/workflow-changes.patch` on this branch before
   merge.** It does:
   - Deletes the `id: model` step; `claude-run` now takes `model: opus` unconditionally.
   - Adds job-level `env.DEEP` (`contains(..., 'agent:deep-review')`); `timeout-minutes`
     repeats the same `contains(...)` expression since `env` isn't readable at job level.
   - `max_turns`: 35, or 60 under `agent:deep-review`.
   - Diff cap in "Resolve issue and diff range": 6000 lines, or 20000 under deep review
     (`if [[ "$DEEP" == "true" ]]`, not `cap=$(... || ...)`, since the step runs under
     `set -euo pipefail`).
   - Prompt: one heredoc, not forked. `$depth_note` appends a 5th checklist item (full
     line-by-line correctness/security audit, read surrounding code freely) only when
     `DEEP=true`; `$word_cap` is 150 normally, 400 under deep review.
   - Header comment (lines 3-6) updated to say Opus always, `agent:deep-review` buys
     depth not a model.
2. `pipeline/README.md` — diagram line 13 now says `agent-pr-review (opus)`; the
   `agent:deep-review` label bullet and the Costs paragraph describe it as a depth
   switch, not a model switch.
3. `scripts/setup-pipeline-labels.sh:12` — label description now "Use a deeper PR
   review for this PR" instead of naming Opus.
4. `agent-planner.yml` — untouched. It already runs `model: opus` (line 112); plan and
   review both confirmed this before I started, so there was nothing to do here.

## Decisions

- Kept the plan's `$depth_note`/`$word_cap` interpolation approach exactly as
  specified, verified the bash logic standalone (empty-string case produces no
  stray blank line; deep case inserts a properly indented item 5).

## Deviations

None. Scope matched the plan exactly.

## For the docs stage / reviewer

- The real workflow edit lives only in `pipeline/137/workflow-changes.patch` — the
  working tree's `.github/workflows/agent-pr-review.yml` is unchanged (reverted after
  generating the patch), so don't expect to see it in `git diff` outside that file.
- `git apply --check pipeline/137/workflow-changes.patch` passes against current HEAD.

## Checks run

- `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/agent-pr-review.yml'))"`
  on the edited file before reverting — passed.
- `actionlint` unavailable (offline runner, `npx` can't fetch it) — skipped per plan's
  fallback.
- `bash -n scripts/setup-pipeline-labels.sh` — passed.
- `git apply --check pipeline/137/workflow-changes.patch` — passed.
- Standalone bash test of the `$DEEP`-driven `depth_note`/`word_cap`/`cap` logic
  outside the workflow file — both branches produce the expected output.
- No backend/frontend code touched (infra/docs only), so the backend/frontend test
  suites in the plan's step 5 don't apply here.
