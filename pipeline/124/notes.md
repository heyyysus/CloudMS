# Coder notes — issue #124

## Implemented

1. **`.github/actions/claude-run/action.yml`** — new `tail` and `tail_file` outputs.
   The `parse` step renders a plain-text transcript tail from `$EXEC_FILE`: one line
   per event (`[assistant] ...`, `[tool] Name: ...`, `[tool-result] ...`), `tail -n 20`,
   truncated to 500 chars/line, secrets redacted (`gh[pousr]_...`, `sk-ant-...`), capped
   at 4000 chars total. Also added a `stop reason` column to the existing cost table in
   `$GITHUB_STEP_SUMMARY`.
2. **`.github/actions/report-failure/action.yml`** — new composite action. Inputs:
   `stage`, `stop_reason`, `target` (`issue`/`pr`/`none`), `number`, `resume`, `tail`,
   `wip_sha`, `github_token`. Resolves the failed step from the Actions jobs API
   (matched on `github.job`, falls back to "step unknown"), falls back to
   `$RUNNER_TEMP/stage.log` for the tail when `claude-run` didn't produce one, writes
   one body to `$RUNNER_TEMP/failure.md`, posts it via `gh issue comment` /
   `gh pr comment --body-file`, and appends it to `$GITHUB_STEP_SUMMARY`. Every external
   call ends `|| true` (`|| :` for the summary write) and the step itself has no
   `set -e`, so a broken reporter degrades instead of masking the real failure.
3. **`.github/actions/report-failure/testdata/execution-sample.json`** — fixture:
   an assistant text event, a `Bash` tool call, a tool result containing a fake
   `ghp_...` token, and a `result` event with `subtype: "error_max_turns"`.
4. **All eight workflows** now report on failure via `report-failure` (patch file,
   see below — this runner's token can't push `.github/workflows/`):
   - `agent-coder`: split "Verify work landed" into "Checkpoint uncommitted work"
     (`if: always()`, keeps the `wip:` commit logic, exposes `wip_sha`) and "Verify
     work landed" (assertions only). `always()` also fires on cancel and the 90-minute
     timeout, not just a step failure — `cancel-in-progress: true` made those lose
     uncommitted work today.
   - `agent-planner`, `agent-plan-reviewer`, `agent-docs`: each stage's commit step
     gained `if: always()` and now branches on `stop_reason` — success commits as
     before; anything else checkpoints what exists as a `wip: <stage> stopped before
     finishing (stop reason: ...)` commit and then **fails the step**, so the
     "Advance state" / "Open PR" step that follows (no `always()`) is skipped and a
     partial `plan.md`/`review.md`/docs commit can never be mistaken for a finished one.
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
- Left the pre-existing double-comment pattern alone: every stage's "ineligible"
  branch already posts its own explanatory comment and exits 1, which also trips the
  new `report-failure` block below it, so an ineligible run now gets two comments
  (unchanged from before — the old generic `gh issue comment` on `failure()` did the
  same). Not fixing since it predates this issue and fixing it means restructuring
  the eligibility gate everywhere, which is out of scope.
- `pipeline/README.md:55` still says the coder gets 200 turns (actual: 400) — the
  plan calls this out as a known stale doc from #137, explicitly out of scope here.

## For the docs stage / reviewer

- The real `.github/workflows/*.yml` edits live only in
  `pipeline/124/workflow-changes.patch` (`git apply --check` passes against this
  branch's HEAD) — the working tree's copies are unchanged from `main`, so they won't
  show up in `git diff` outside that one file. **A human must
  `git apply pipeline/124/workflow-changes.patch` on this branch before merge.**
- `.github/actions/claude-run/action.yml` and `.github/actions/report-failure/**` are
  real commits (not under `.github/workflows/`), so those are already in the diff
  normally.
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
- Fixture test of the tail renderer, run standalone against
  `.github/actions/report-failure/testdata/execution-sample.json` using the exact jq
  filter embedded in `claude-run/action.yml`'s `parse` step, piped through the same
  `tail -n 20 | cut -c1-500 | sed -E <redact> | head -c 4000` chain:
  ```
  jq -r '[.[] | (if .type=="assistant" then (.message.content // [])|map(if .type=="text" then "[assistant] "+((.text//"")|split("\n")[0]) elif .type=="tool_use" then "[tool] "+.name+": "+(((.input.command // .input.file_path // .input.pattern // "")|tostring)|split("\n")[0]) else empty end) elif .type=="user" then (.message.content // [])|map(if .type=="tool_result" then "[tool-result] "+((if (.content|type)=="string" then .content else ((.content // [])|map(.text // "")|join(" ")) end)|split("\n")[0]) else empty end) else [] end)] | flatten | .[]' \
    .github/actions/report-failure/testdata/execution-sample.json \
    | tail -n 20 | cut -c1-500 \
    | sed -E 's/gh[pousr]_[A-Za-z0-9]{20,}/[REDACTED]/g; s/sk-ant-[A-Za-z0-9_-]{20,}/[REDACTED]/g' \
    | head -c 4000
  ```
  Output: 3 lines (≤20 ✓), the `ghp_...` token replaced with `[REDACTED]` (✓), and
  `jq -r '.subtype' <<< "$(jq -c '[.[]|select(.type=="result")]|last' testdata/execution-sample.json)"`
  returns `error_max_turns` (✓, the pre-existing subtype extraction, unchanged).
- `git apply --check pipeline/124/workflow-changes.patch` against this branch's HEAD
  — passes.
- No backend/frontend suites run: this issue touches only `.github/**`,
  `pipeline/**`, and `.claude/agents/orchestrator.md`.

## Docs

No doc changes needed — this is pipeline/CI infrastructure only (GitHub Actions
and the orchestrator agent prompt), with no route/API, auth/session, UI, or
setup/env/deploy changes for `docs/API.md`, `docs/AUTH_SESSIONS_EXPLAINED.md`,
`docs/frontend-ui-design.md`, or `README.md` to reflect.
