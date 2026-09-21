---
issue: 151
status: pending-review
---
# report-failure: caller-supplied headline, and append the shell log to the tail

## Goal

Two edits to `.github/actions/report-failure/action.yml`, plus one call-site edit in
`.github/workflows/agent-docs.yml` that ships as a patch:

1. A successful `agent-docs` run that stopped early posts a comment headed
   **docs stage stopped early**, not **docs stage failed** — step "step unknown".
2. A stage whose shell command fails after Claude ran quotes that command's error.
   `stage.log` is *appended* to the comment as its own collapsed block instead of
   being a fallback that never fires.

Done when: `report-failure` takes an `outcome` input (default `failed`, so every
current caller is byte-identical); it renders a "shell output" block whenever
`$RUNNER_TEMP/stage.log` exists; `agent-docs.yml`'s notice call passes
`outcome: stopped early`; and `bash .github/actions/claude-run/render-tail.test.sh`
plus a new `render-log.test.sh` both pass in CI's `pipeline-actions` job.

## Scope check

Pipeline infrastructure, not a product pillar — it protects the roadmap rather than
advancing it. PROJECT.md §Direction is untouched; no backend, frontend, or docs
surface changes.

Triage labels are right except one: **`risk:high` is wrong, this is `risk:low`.**
The diff is two bash blocks in a composite action plus one workflow input, the new
`outcome` default reproduces today's wording exactly, and the new log block is
additive inside a `<details>`. Nothing the action does can fail the stage it reports
on — the step has no `set -e` by design.

`Depends on: #147` is already satisfied: #147 merged as `f400eea`.

## Files / areas

| Path | Change |
|---|---|
| `.github/actions/report-failure/action.yml` | new `outcome` input; headline built from it; `stage.log` appended, not fallback |
| `.github/actions/report-failure/render-log.sh` | **new** — tail/truncate/redact a plain log file (mirrors `claude-run/render-tail.sh`) |
| `.github/actions/report-failure/render-log.test.sh` | **new** — fixture test, same shape as `render-tail.test.sh` |
| `.github/actions/report-failure/testdata/stage-sample.log` | **new** — fixture with a `gh` error and a planted token |
| `.github/workflows/ci.yml` | add the new test to job `pipeline-actions` (line 46 area) |
| `.github/workflows/agent-docs.yml` | **patch only** — `outcome: stopped early` on the notice call (line 201-215), and drop the stale tee comment (lines 153-155) |

No backend, frontend, or `docs/` files. `.github/workflows/**` is the only restricted
path, so everything but the last row pushes normally.

## Approach

1. **Add the `outcome` input** to `report-failure/action.yml`, `default: failed`,
   described as the bolded claim in `**<stage> stage <outcome>**`. Export it as
   `OUTCOME` in the step `env:` block alongside `STAGE`.

2. **Build the headline from it** (replacing the hardcoded line 80). Keep the
   `step unknown` fallback only on the default path — a real failure always has a
   failed step, so an empty lookup there means the jobs API lagged, which is what
   the fallback was for:

   ```bash
   [[ "$OUTCOME" == "failed" ]] && failed_step="${failed_step:-step unknown}"
   line="**$STAGE stage $OUTCOME**"
   [[ -n "$failed_step" ]] && line="$line — step \"$failed_step\","
   echo "$line stop reason \`${STOP_REASON:-unknown}\`."
   ```

   Delete the unconditional `failed_step="${failed_step:-step unknown}"` at line 67.
   Every existing caller passes no `outcome`, so their comments are unchanged.

3. **Extract the log rendering into `render-log.sh`** — the `tail -n 20 | cut -c1-500
   | sed -E <redactions> | head -c 4000` pipeline currently inlined at lines 71-74,
   taking the log path as `$1` and writing to stdout. Copy `render-tail.sh`'s
   trailing-newline guarantee: the output is `cat`-ed into a markdown fence, and a
   mid-line cut that loses its newline runs the text into the closing backticks.

4. **Append instead of falling back.** Replace the `if [[ -z "$tail" && -f … ]]`
   guard with an unconditional read, and render two independent blocks in the body:

   ```bash
   shell_log=""
   [[ -f "${RUNNER_TEMP}/stage.log" ]] && \
     shell_log=$(bash "$GITHUB_ACTION_PATH/render-log.sh" "${RUNNER_TEMP}/stage.log" || true)
   ```

   Body: `<details><summary>Last ~20 lines of Claude's output</summary>` for `$tail`
   when non-empty, then `<details><summary>Last ~20 lines of shell output</summary>`
   for `$shell_log` when non-empty. Each keeps its own caps; nothing is concatenated
   before truncation. Update the `tail` input's description — it is no longer "a
   fallback".

5. **Wire the test into CI**: one more `run:` step in `ci.yml`'s `pipeline-actions`
   job. The `actions` paths-filter already covers `.github/actions/**`, so no filter
   change is needed.

6. **Save the workflow half as a patch.** Edit `agent-docs.yml` (add `outcome:
   stopped early` to the "Report an incomplete docs run" call; replace the three-line
   comment above the tee with one line saying the shell log is now always appended),
   then `git diff -- .github/workflows > pipeline/151/workflow-changes.patch`,
   `git checkout -- .github/workflows`, and commit the patch. The PR body will read
   `Refs #151` — that is #147's guard working as intended.

## Tests

- **New:** `bash .github/actions/report-failure/render-log.test.sh`, modelled line
  for line on `render-tail.test.sh`. Cover: renders the last 20 lines and no more;
  each line cut to 500 chars; whole output ≤ 4000 chars; output ends with a newline
  even on a mid-line cut; `ghp_`/`github_pat_`/`sk-ant-` values redacted with a
  `[REDACTED]` marker left behind; exits 0 on an empty file and on a missing file.
- **Regression:** `bash .github/actions/claude-run/render-tail.test.sh` still passes
  (untouched, but it is the acceptance criterion).
- **By inspection:** the headline conditional. It lives in inline YAML with no
  harness; walk the three cases in `notes.md` — default `failed` with a step, default
  `failed` with the API lagging, and `outcome: stopped early`.
- **Not run:** the backend suite. Nothing under `backend/` changes.

## Touches backend

no

## Risks / open questions

1. **The workflow patch may not be applied**, and then change 1 lands half-done. The
   failure mode is benign by construction: without the call-site edit `outcome`
   defaults to `failed` and `agent-docs` posts exactly the comment it posts today. No
   regression, just the bug surviving. Say this plainly in `notes.md`.
2. **The docs notice comment will now carry a shell-output block** containing the
   *successful* `gh pr create` chatter, since `stage.log` is `tee -a`-ed across steps.
   It is collapsed and short. Planned as acceptable; flag it for the reviewer rather
   than adding an input to suppress it.
3. **`$GITHUB_ACTION_PATH` in a composite action** resolves to the action's own
   directory, which is where `render-log.sh` lives — the same call `claude-run` makes
   for `render-tail.sh` at `action.yml:105`. Low risk, proven in-repo.
4. **Open question, decided:** the issue offers "drop the tee" as an alternative to
   appending. Appending, per the issue's own recommendation — it is what makes
   `agent-coder.yml`'s three tees (lines 94, 167, 187) visible too.

## Out of scope

- De-duplicating the redaction `sed` shared by `render-tail.sh` and `render-log.sh`.
  A cross-action shared script needs a `$GITHUB_ACTION_PATH/../` reach-out; not worth
  it for three patterns.
- A test harness for the rest of `report-failure`'s body (resume line, WIP sha, the
  `gh issue comment` dispatch).
- The other stages' `report-failure` call sites. They keep the default `outcome` and
  gain the shell-output block for free.
- Anything under `backend/`, `frontend/`, or `docs/`.
