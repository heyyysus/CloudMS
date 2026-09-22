# Notes — issue #151

**Apply `pipeline/151/workflow-changes.patch` before/at merge** (this runner's
token can't push under `.github/workflows/`). Steps are in the patch's own
"Apply the workflow patch before merging" section of the PR body. Until applied,
`report-failure` still defaults to today's exact output for every caller, but
`agent-docs.yml` won't pass `outcome: stopped early` (original bug persists) and
`ci.yml` won't run the new `render-log.test.sh` step.

## Implemented

`.github/actions/report-failure/action.yml`:
- New `outcome` input, default `failed`. Headline built from it:
  `**$STAGE stage $OUTCOME** — step "$failed_step", stop reason ...`. The
  `step unknown` fallback only applies when `OUTCOME == failed`, so `stopped
  early` drops the step clause instead of showing a stale one.
- `tail`'s "falls back to stage.log" behavior is gone: `stage.log` (if present)
  is now always rendered via new `render-log.sh` and appended as its own
  `<details>` block, independent of `tail`.

New: `render-log.sh` + `render-log.test.sh` + `testdata/stage-sample.log`, mirror
`claude-run/render-tail.sh`/`render-tail.test.sh` line for line. Both pass.

`.gitignore`: added `!.github/actions/report-failure/testdata/*.log` — the
blanket `*.log` rule was silently excluding the new fixture.

Workflow half (`agent-docs.yml`'s `outcome: stopped early` + comment cleanup,
`ci.yml`'s new CI step) is in `workflow-changes.patch`, see top of this file.
`.github/workflows` itself is reverted — nothing under it is committed.

## Decisions

Followed plan.md steps 1-6 as written; its line numbers matched the actual files
exactly, no adjustment needed.

## Deviations

**plan.md's file table says `ci.yml` "pushes normally"** — wrong for this
runner: the token can't push *any* `.github/workflows/` change, no carve-out for
`ci.yml`. Put both workflow files in one patch instead of committing `ci.yml`
directly. Same "benign until applied" shape as plan.md's risk #1, just now
covering the CI wiring too.

## For the docs stage / reviewer

- No doc changes expected — pure pipeline-infrastructure change (plan.md,
  "Touches backend: no").
- Headline verified by inspection (inline YAML bash, no harness), reproduced
  outside the action with the same variable assignments as `action.yml`:
  - `outcome=failed`, `failed_step=step x` → `**docs stage failed** — step "step x", stop reason \`error_max_turns\`.`
  - `outcome=failed`, `failed_step=` (API lagged) → `**docs stage failed** — step "step unknown", stop reason \`error_max_turns\`.`
  - `outcome=stopped early`, `failed_step=` → `**docs stage stopped early** stop reason \`error_max_turns\`.` (no step clause)

## Checks run

- `bash .github/actions/report-failure/render-log.test.sh` — 14/14 pass.
- `bash .github/actions/claude-run/render-tail.test.sh` — regression, 17/17
  still pass, file untouched.
- `python3 -c "yaml.safe_load(...)"` on `action.yml`, `ci.yml`, `agent-docs.yml`
  — all parse.
- `shellcheck` on `render-log.sh`, `render-log.test.sh`, and the inline `run:`
  block extracted from `action.yml` — clean.
- No backend/frontend files touched; those check suites don't apply and were
  not run, per plan.md ("Not run: the backend suite").

## Docs

No doc changes needed — change is confined to `.github/actions/report-failure`
(a CI failure-reporting action), no route/auth/UI/setup surface touched.
