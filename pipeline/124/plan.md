---
issue: 124
status: pending-review
---
# Failed stages report stop reason + log tail, and never lose work

## Goal

A failed pipeline stage posts *why* it failed, not just a run URL, and nothing a
stage had written is lost when it dies. Done when:

1. Every failure comment carries: the stage, the failed step, the Claude
   `stop_reason`, the last ~20 lines of that stage's output in a fenced block,
   the run URL, and the one-line resume instruction for that stage.
2. The same body is written to `$GITHUB_STEP_SUMMARY`.
3. All eight stages report: `agent-coder`, `agent-docs`, `agent-planner`,
   `agent-plan-reviewer`, `agent-pr-review`, `agent-pr-fixer`, `agent-trigger`,
   `agent-triage` — the last three have no `if: failure()` block today.
4. `error_max_turns` is readable from the comment alone. The orchestrator's
   §7 self-heal (`.claude/agents/orchestrator.md:218`) currently needs a human
   or an agent to open the run log to see it.
5. The coder's WIP commit survives a **cancel or a 90-minute timeout**, not only
   a step failure — and the planner, plan reviewer and docs stages checkpoint
   the same way.

**Progress-saving is built as reading (a)** from the orchestrator's block: the
stage commits leftovers to `agent/issue-<n>` as a `wip:` commit so a re-run
resumes. See *Risks* #4 for what (b) and (c) would cost instead.

## Scope check

Pipeline infra, same shape as #137 — it touches no PROJECT.md pillar and no
roadmap item. It is maintenance on the tooling that builds the roadmap, and the
payoff is direct: every `error_max_turns` today costs a human a trip into the
Actions log to learn a fact the run already knew.

**`area:backend` is wrong** (the orchestrator flagged this too) — the work is
`.github/workflows/**` and `.github/actions/**`, so the right label is
`area:infra`, and `risk:high` per the triage rules, which means no auto-merge.
`enhancement` and `agent` are right.

**The coder cannot push `.github/workflows/`.** Those eight edits went to
`pipeline/124/workflow-changes.patch` for a human to apply, exactly as #137 did.
**That has since happened: the patch was applied by hand, the eight workflow
edits are real commits on this branch, and the patch file is deleted. Every
reference below that names it records the plan as written, not a step still to
run.**
`.github/actions/**` is *not* under the `workflows` scope, so put every line of
real logic there and keep the patch to thin call-sites.

## Files / areas

| path | change |
|---|---|
| `.github/actions/report-failure/action.yml` | **new** composite: builds the body, posts the comment, writes the step summary |
| `.github/actions/claude-run/action.yml` | new `tail` output (rendered transcript tail); add stop reason to the summary table |
| `.github/actions/claude-run/testdata/execution-sample.json` | fixture for the tail renderer (moved here from `report-failure/`, which never ran it) |
| `.github/workflows/agent-{coder,docs,planner,plan-reviewer,pr-review,pr-fixer,trigger,triage}.yml` | call `report-failure`; checkpoint steps (applied directly) |
| `pipeline/README.md` | what a failure comment contains; "Resuming / intervening" |
| `.claude/agents/orchestrator.md` | §7: stop reason is in the comment, stop reading run logs |
| ~~`pipeline/124/workflow-changes.patch`~~ | the eight workflow edits — applied, and the file removed |

## Approach

1. **Render a tail in `claude-run`.** In the `parse` step, after the cost table,
   build a plain-text transcript tail from `$EXEC_FILE` — one line per event,
   newest last: `[assistant] <first line of text>`, `[tool] Bash: <first line of
   command>`, `[tool-result] <first line>`. `tail -n 20`, truncate each line to
   500 chars, then **redact** (see Risks #1). Write it to
   `$RUNNER_TEMP/claude-tail.txt` and expose `tail` (heredoc-delimited, same
   `__CLAUDE_RESULT__` pattern as `result`, lines 95-99) plus `tail_file`.
   Add `stop_reason` as a column in the existing summary table (line 84).
2. **Write `report-failure`.** Inputs: `stage`, `stop_reason` (optional),
   `target` (`issue` | `pr` | `none`), `number`, `resume` (one line of prose),
   `tail` (optional), `github_token`. It:
   - resolves the failed step name from
     `gh api repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/attempts/$GITHUB_RUN_ATTEMPT/jobs`,
     taking the first step whose `conclusion == "failure"` (in-progress jobs
     already report conclusions for finished steps);
   - falls back to `$RUNNER_TEMP/stage.log` for the tail when no Claude tail was
     passed (step 3);
   - writes the body once to `$RUNNER_TEMP/failure.md`, then
     `gh issue comment --body-file` / `gh pr comment --body-file` and
     `cat >> "$GITHUB_STEP_SUMMARY"`;
   - ends every step with `|| true`, matching the existing blocks — a broken
     reporter must not replace the real failure.
3. **Give shell steps a log to tail.** In the steps that run real commands
   (coder "Install and set up database" / "Verify work landed", docs "Open PR"),
   add one line at the top: `exec > >(tee -a "$RUNNER_TEMP/stage.log") 2>&1`.
   Safe under `set -euo pipefail` and leaves `$GITHUB_OUTPUT` writes untouched.
4. **Rewire the five existing `if: failure()` blocks** (`agent-coder.yml:187`,
   `agent-docs.yml:144`, `agent-planner.yml:135`, `agent-plan-reviewer.yml:135`,
   `agent-pr-review.yml:160`). Keep the `gh issue edit … --add-label
   needs-human` line exactly as it is; replace only the `gh issue comment`/`gh pr
   comment` line with a `uses: ./.github/actions/report-failure` step. Pass
   `stop_reason: ${{ steps.claude.outputs.stop_reason }}` — the Claude step is
   `continue-on-error`, so the job fails at the *next* step and the output is
   still readable. `resume` per stage, copied from `pipeline/README.md:44-51`.
5. **Add the three missing blocks.** `agent-trigger` and `agent-triage`:
   comment only, **no `needs-human`** — neither issue is necessarily in the
   pipeline, and labelling one that is not would strand it. `agent-pr-fixer`:
   an `if: failure()` block posting to the `orchestrator:log` issue
   (`steps.ctx.outputs.log_issue`), alongside its existing non-clean-stop step
   at line 203, which should also gain the tail.
6. **Split the coder's WIP commit out of "Verify work landed"**
   (`agent-coder.yml:159-177`). New step "Checkpoint uncommitted work" with
   `if: always()`, holding lines 167-172 and exposing `wip_sha`; "Verify work
   landed" keeps the assertions and runs on success as now. `always()` also
   fires on cancellation and on the job timeout, which is the case that loses
   work today — `cancel-in-progress: true` (line 21) makes a re-label mid-run
   drop everything uncommitted.
7. **Give the planner, plan reviewer and docs the same checkpoint.** All three
   have a real branch checked out and write files a failed run currently throws
   away (`plan.md`, `review.md`, notes). One `if: always()` step each: commit as
   `wip: <stage> stopped before finishing (stop reason: …)` and push, `|| true`.
   Have `report-failure` name the WIP sha in the comment when one was made.
8. **Update the docs in the same commit.** `pipeline/README.md`: a short
   "When a stage fails" paragraph listing what the comment contains, and the
   partial-artifact note in "Resuming / intervening". `.claude/agents/
   orchestrator.md` §7: the stop reason is in the issue comment now.

## Tests

No test framework covers Actions YAML or composite actions here (#137 hit the
same wall). Verify with, in order:

1. `npx --yes actionlint` over every changed workflow **and** both action files
   — it checks the shell in `run:` blocks too.
2. `shellcheck` the `run:` bodies of the two composite actions (extract them, or
   let actionlint's built-in shellcheck cover it).
3. **Fixture test of the tail renderer**, the one piece with real logic: build
   `testdata/execution-sample.json` as a small stream containing an assistant
   text event, a Bash tool call, a tool result, a fake `ghp_`-shaped token, and
   a `result` event with `"subtype": "error_max_turns"`. Run the renderer over
   it and assert: ≤20 lines, the token is redacted, the subtype is reported.
   Record the exact command in `pipeline/124/notes.md`.
4. ~~`git apply --check pipeline/124/workflow-changes.patch` before committing it.~~
   Done — the patch is applied and the file is gone. `render-tail.test.sh` now
   covers item 3 and runs in CI on any change under `.github/actions/**`.

The end-to-end check is the next real failure after merge — its comment should
show the stop reason and a tail. If you want one on demand, temporarily set a
stage's `max_turns` to `1` on a scratch issue.

## Touches backend

no

## Risks / open questions

1. **Secret leakage into a public comment.** GitHub masks registered secrets in
   *run logs only* — a comment posted via the API is not masked. A tail that
   captures a tool result containing a token publishes it. Mitigate in the
   renderer: prefer assistant text and command lines over full tool results,
   redact `gh[pousr]_[A-Za-z0-9]{20,}` and `sk-ant-[A-Za-z0-9_-]{20,}`, and cap
   the whole block at ~4000 chars. Flag anything still uncertain in `notes.md`;
   the plan reviewer should weigh whether the tail belongs in the step summary
   only.
2. **A partial `plan.md` pushed as `wip:` could be mistaken for a real plan.**
   The plan reviewer triggers on a label, not a push, so nothing auto-consumes
   it — but the `wip:` subject prefix and the failure comment must both say the
   file is incomplete.
3. **`agent-triage` fires on every human-opened issue.** A failure there now
   comments on issues that were never in the pipeline. Comment only, never
   label, and keep the body to two lines plus the tail.
4. **Reading (a) may be the wrong one.** (b) periodic checkpointing during the
   run has no clean lever — the coder prompt already says "commit early and
   often" (`agent-coder.yml:112-113`) and a background timer inside the runner
   would race the agent's own `git` calls; a first cut would be a prompt-level
   "push every N commits" instead. (c) a separate failure branch costs a branch
   per attempt and breaks the existing resume path, which reads the PR branch.
   Both are a re-plan, roughly 20 minutes. Say the word before the coder starts.
5. **The failed-step lookup may return nothing** when the job is cancelled or
   the API lags. Fall back to "step unknown" rather than failing the reporter.

## Out of scope

- `agent-cleanup.yml` — no Claude stage, nothing to report, not in the spec.
- A WIP checkpoint in `agent-pr-fixer`: it pushes to the PR branch, so a `wip:`
  commit there would re-trigger `agent-pr-review` and burn a fix round.
- Changing any stage's `max_turns`, `timeout-minutes`, or model. This issue
  makes cap hits *legible*; making them rarer is a separate issue.
- Retry-on-failure. The orchestrator's §7 self-heal already owns that decision,
  and it gets better input from this change.
- `pipeline/README.md:55` still says the coder gets 200 turns where
  `agent-coder.yml:47` says 400. Stale doc, noted in #137 too, separate fix.
