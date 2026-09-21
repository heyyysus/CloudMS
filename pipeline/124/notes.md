# Coder notes — issue #124

## Implemented

1. **`.github/actions/claude-run/action.yml`** — new `tail` and `tail_file` outputs.
   The `parse` step calls `render-tail.sh` (below) on `$EXEC_FILE` and writes the result
   to both outputs. Also added a `stop reason` column to the existing cost table in
   `$GITHUB_STEP_SUMMARY`.
1b. **`.github/actions/claude-run/render-tail.sh`** — the renderer itself: one line per
   event (`[assistant] ...`, `[tool] Name: ...`, `[tool-result] ...`), `tail -n 20`,
   500 chars/line, 4000 chars total, secrets redacted (`gh[pousr]_...`,
   `github_pat_...`, `sk-ant-...`), and always exactly one trailing newline. A separate
   file, not an inline `run:` block, so a test can run it.
2. **`.github/actions/report-failure/action.yml`** — new composite action. Inputs:
   `stage`, `stop_reason`, `target` (`issue`/`pr`/`none`), `number`, `resume`, `tail`,
   `wip_sha`, `github_token`. Resolves the failed step from the Actions jobs API
   (matched on `github.job`, falls back to "step unknown"), falls back to
   `$RUNNER_TEMP/stage.log` for the tail when `claude-run` didn't produce one, writes
   one body to `$RUNNER_TEMP/failure.md`, posts it via `gh issue comment` /
   `gh pr comment --body-file`, and appends it to `$GITHUB_STEP_SUMMARY`. Every external
   call ends `|| true` (`|| :` for the summary write) and the step itself has no
   `set -e`, so a broken reporter degrades instead of masking the real failure.
3. **`.github/actions/claude-run/render-tail.test.sh` + `testdata/execution-sample.json`**
   — run it with `bash .github/actions/claude-run/render-tail.test.sh`. 17 checks over
   the fixture (assistant text, a `Bash` tool call, string and block tool results
   carrying fake `ghp_...`, `github_pat_...` and `sk-ant-...` tokens) plus two
   synthesised transcripts for the 20-line, 500-char and 4000-char caps and the
   trailing newline. CI runs it on every change under `.github/actions/**`
   (`ci.yml`, job `pipeline-actions`).
4. **All eight workflows** now report on failure via `report-failure`:
   - `agent-coder`: split "Verify work landed" into "Checkpoint uncommitted work"
     (`if: always()`, keeps the `wip:` commit logic, exposes `wip_sha`) and "Verify
     work landed" (assertions only). `always()` also fires on cancel and the 90-minute
     timeout, not just a step failure — `cancel-in-progress: true` made those lose
     uncommitted work today.
   - `agent-planner`, `agent-plan-reviewer`: each stage's commit step gained
     `if: always()` and now branches on `stop_reason` — success commits as before;
     anything else checkpoints what exists as a `wip: <stage> stopped before
     finishing (stop reason: ...)` commit and then **fails the step**, so the
     "Advance state" step that follows (no `always()`) is skipped and a partial
     `plan.md`/`review.md` can never be mistaken for a finished one.
   - `agent-docs`: same `if: always()` checkpoint, but it **does not fail the step**.
     The planner and plan reviewer hard-fail because the next stage consumes their
     artifact, so a partial `plan.md` drives a bad implementation. The docs stage's
     only consumer is the PR review, which reads the diff either way, so failing
     there would strand the issue on `needs-human` and cost a human round for
     documentation a reviewer was going to read regardless. Instead it sets
     `docs_incomplete`, "Open PR" runs as normal, and a dedicated
     `Report an incomplete docs run` step posts the same `report-failure` body —
     stop reason, tail, run URL, and the WIP sha when one was made.
   - `agent-pr-review`, `agent-pr-fixer`: no artifact to checkpoint (read-only /
     pushes only on success); failure block just rewired to `report-failure`.
     `agent-pr-fixer`'s existing "Report a run that did not finish" step (a soft,
     non-`failure()` case — the fixer decides for itself whether a non-success stop
     reason is fatal) also gained the tail.
   - `agent-trigger`, `agent-triage`: new `failure()` blocks, comment-only, no
     `needs-human` — neither guarantees the issue is in the pipeline.
   - Shell steps that run real commands (coder's "Install and set up database",
     "Checkpoint uncommitted work", "Verify work landed") start with
     `exec > >(tee -a "$RUNNER_TEMP/stage.log") 2>&1` so `report-failure` has
     something to tail when the failure happens outside a Claude run.
5. **`pipeline/README.md`** — new "When a stage fails" section (what the comment
   contains); "Resuming / intervening" now covers cancel/timeout checkpoints for all
   four stages that write pipeline artifacts, not just the coder's turn cap.
6. **`.claude/agents/orchestrator.md`** §7 — the `error_max_turns` self-heal bullet
   now says the stop reason is in the comment/summary already, so stop opening the
   run log for it.

## Decisions

- **Secret check (plan review's ask):** `claude setup-token` mints `CLAUDE_CODE_OAUTH_TOKEN`
  values with the same `sk-ant-` prefix Anthropic uses for API keys (just a different
  segment after it, e.g. `sk-ant-oat...` vs `sk-ant-api...`), and the segment is
  alphanumeric-plus-dashes throughout. The plan's existing `sk-ant-[A-Za-z0-9_-]{20,}`
  pattern already matches it — no third pattern needed.
- `actionlint` does **not** lint composite `action.yml` files directly (it only
  accepts workflow files as arguments, and running it repo-wide does not descend into
  a local composite action's own `run:` steps either — confirmed by deliberately
  breaking `claude-run`'s script and re-running `actionlint` with no diff in output).
  Verified the two composite actions' shell instead by extracting each `run:` block
  with `python3 -c "import yaml; ..."` and piping it through `bash -n` and
  `shellcheck -s bash` directly (see Checks run).
- Split the docs/planner/plan-reviewer "commit" steps' success/failure paths inside a
  single `if: always()` step rather than adding a second step, so there is exactly one
  place that decides whether a run counts as finished — mirrors how the coder's
  "Verify work landed" already used the last-commit-prefix check as its source of
  truth, just moved the branch earlier so a failed run's `wip:` commit can't also
  trigger "Advance state"/"Open PR".

## Deviations

- Plan step 1 described the redactor as "prefer assistant text and command lines over
  full tool results." I kept tool results in the tail (truncated/redacted like
  everything else) rather than excluding them outright — cutting them would often
  leave a failure comment with no visible error message at all (the error text is
  usually *in* the tool result, e.g. a failed test's stderr). Redaction + the 500
  char/line cap + the 4000 char total cap is the mitigation the plan actually
  specified for the leak risk; I didn't also special-case tool-result content.
- **Plan step 7 said all three stages fail the step; `agent-docs` does not.** See
  item 4 above for the reasoning. Raised by review round 2 on this PR, which
  reversed round 1's finding on the same line.
- Left the pre-existing double-comment pattern alone: every stage's "ineligible"
  branch already posts its own explanatory comment and exits 1, which also trips the
  new `report-failure` block below it, so an ineligible run now gets two comments
  (unchanged from before — the old generic `gh issue comment` on `failure()` did the
  same). Not fixing since it predates this issue and fixing it means restructuring
  the eligibility gate everywhere, which is out of scope.
- `pipeline/README.md:55` still says the coder gets 200 turns (actual: 400) — the
  plan calls this out as a known stale doc from #137, explicitly out of scope here.

## For the docs stage / reviewer

- The `.github/workflows/*.yml` edits are **real commits on this branch**. They were
  not, originally: `agent-coder`'s token has no `workflows` scope, so the stage wrote
  them to `pipeline/124/workflow-changes.patch` and reverted the files. That patch has
  since been applied and the file removed, so the eight stage edits now show up in
  `git diff` like anything else and there is nothing left for a human to apply.
- `.github/actions/claude-run/**` and `.github/actions/report-failure/**` were always
  real commits (not under `.github/workflows/`).
- `render-tail.sh` and `render-tail.test.sh` lost their executable bit when the patch
  was applied through the GitHub contents API, which creates blobs as `100644`. Every
  call site invokes them as `bash <path>` (`claude-run/action.yml`, `ci.yml`, and the
  test's own call to the renderer), so nothing depends on the bit.
- No backend/frontend code touched.

## Checks run

- `python3 -c "import yaml; yaml.safe_load(open(...))"` on every changed/added
  `action.yml` and `workflow.yml` — all parse.
- `actionlint` (v1.7.12, installed via the upstream `download-actionlint.bash`
  script since it's not in this repo's toolchain) over the whole repo, before and
  after the workflow edits: same two pre-existing findings both times
  (`agent-orchestrator.yml:67` SC2129, `agent-plan-reviewer.yml:138` SC2016), no new
  findings from this change.
- Extracted every changed `run:` block (workflows and both composite actions) with a
  small `python3`/`yaml` script and ran `bash -n` (syntax) then `shellcheck -s bash`
  on each — all pass, no new warnings beyond the two actionlint already found.
- `bash .github/actions/claude-run/render-tail.test.sh` — 17/17 pass. Each check was
  confirmed to fail against the unfixed renderer (see *Review round 1* below).
- After the patch was applied: YAML parse and `bash -n` re-run over all nine workflow
  files and both composite actions against the pushed branch — clean, and the renderer
  test re-run there passes 17/17.
- `agent-docs`'s "Commit docs" step run directly against a stubbed `git` for both
  unclean-stop cases: with staged changes it exits 0 and sets `wip_sha` +
  `docs_incomplete`; with nothing staged it exits 0 and sets `docs_incomplete` only,
  so `report-failure` cannot claim a WIP commit that was never made.
- No backend/frontend suites run: this issue touches only `.github/**`,
  `pipeline/**`, and `.claude/agents/orchestrator.md`.

## Review round 1 (pr-fixer, 21 Sep)

Five advisory findings, all fixed on this branch.

1. **`$GITHUB_OUTPUT` could break on a long transcript.** `head -c 4000` cut the tail
   mid-line, so the file had no trailing newline and `cat` ran the `__CLAUDE_TAIL__`
   delimiter onto the last content line — which fails the `parse` step and loses
   `stop_reason` for the whole stage, the one thing this issue exists to report.
   `render-tail.sh` now renders through a command substitution and re-adds exactly one
   newline; `head`'s SIGPIPE can no longer trip `pipefail` either (the script does not
   `set -e` and exits 0 explicitly). Verified: with the old `head -c … > file` form, the
   test's *"a mid-line cut still ends with a newline"* check fails.
2. **The docs stage could advance a half-written run.** Its `elif` committed `wip:` and
   exited 0, so "Open PR" still ran and the issue moved to `pipeline:pr-open`. Fixed
   then by failing the step — and re-opened by round 2, which pointed out that the
   hard fail strands the issue instead. Settled as: checkpoint, carry on, and report
   through `report-failure`. See item 4 under *Implemented*.
3. **`agent-trigger` and `agent-triage` always said "step unknown".** Both pass
   `github.token` to `report-failure`, whose jobs-API call needs `actions: read`; their
   `permissions:` blocks granted only `issues`/`contents`. Both now grant it, and
   `report-failure` says so where the call is made.
4. **Fine-grained tokens were not redacted.** `gh[pousr]_…` does not match
   `github_pat_…`, the shape of `PIPELINE_BOT_TOKEN`. Added that pattern to
   `render-tail.sh` and to `report-failure`'s `stage.log` fallback. Verified: with the
   old two-pattern regex, the fixture's `github_pat_…` check fails.
5. **Nothing ran the fixture.** It lived under `report-failure`, which does not use it,
   and the jq filter it exercised was a copy in `notes.md`. Moved to
   `.github/actions/claude-run/testdata/`, and `render-tail.test.sh` now runs the real
   script against it in CI (`ci.yml`, job `pipeline-actions`, on any change under
   `.github/actions/**`).

Findings 2, 3 and 5's `ci.yml` job were workflow edits, so they lived in
`workflow-changes.patch` rather than the tree. That patch is now applied, so the test
does run in CI.

## Review round 2 (21 Sep)

1. **The docs hard-fail was a policy change nobody asked for** — reversed, see round 1
   item 2 and *Implemented* item 4.
2. **The incomplete path reported nothing.** Exiting 0 meant `if: failure()` never
   fired, so `wip_sha` had no consumer and the issue got a hand-rolled comment with no
   failed step, no tail and no run URL. Replaced with a `Report an incomplete docs run`
   step calling `report-failure`, gated on `success()` so it cannot double up with the
   `failure()` block.
3. **The "Open PR" tee comment was wrong.** `report-failure` prefers `claude-run`'s
   `tail` and only reads `stage.log` when that is empty — which happens when there is
   no execution file at all. The tee earns its place on that narrower case; the comment
   now says so.
4. **The reversal lived only in an inline comment.** This section, *Implemented* item 4
   and `plan.md` approach 7 now record it.

## Docs

No doc changes needed — this is pipeline/CI infrastructure only (GitHub Actions
and the orchestrator agent prompt), with no route/API, auth/session, UI, or
setup/env/deploy changes for `docs/API.md`, `docs/AUTH_SESSIONS_EXPLAINED.md`,
`docs/frontend-ui-design.md`, or `README.md` to reflect.
