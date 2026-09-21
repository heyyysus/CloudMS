---
issue: 137
status: pending-review
---
# PR review on Opus; `agent:deep-review` becomes a depth switch

## Goal

`agent-pr-review` runs Opus on every agent PR, and `agent:deep-review` selects a
deeper review instead of a different model. Done when:

1. `.github/workflows/agent-pr-review.yml` passes `model: opus` unconditionally —
   the `steps.model` shell branch is gone.
2. `agent:deep-review` still changes behaviour: full line-by-line audit prompt,
   `max_turns` 35 → 60, `timeout-minutes` 10 → 20, diff cap 6000 → 20000 lines.
3. `agent-coder` (sonnet), `agent-triage` (haiku) unchanged.
4. `pipeline/README.md` and `scripts/setup-pipeline-labels.sh` describe the new
   meaning of the label; no doc still says "Opus is used only by the planner".

**The planner is already on Opus.** `.github/workflows/agent-planner.yml:112` has
`model: opus` and has since the pipeline landed (d97a2be) — the issue's first
bullet describes a change that does not exist. No planner edit is needed; the
plan reviewer should confirm rather than assume the file was missed.

## Scope check

Infra for the agent pipeline, not product code — it touches no PROJECT.md pillar
and no roadmap item. It is maintenance on the tooling that builds the roadmap,
which is why the cost argument in the issue carries it: planner once per issue,
reviewer once per push, against the coder's 400-turn runs.

Triage labels look right: `enhancement`, `agent`, `area:infra`.

## Files / areas

| path | change |
|---|---|
| `.github/workflows/agent-pr-review.yml` | model → opus; `DEEP` job env; depth-driven turns/timeout/diff cap/prompt; header comment |
| `pipeline/README.md` | diagram line 13 `(sonnet)` → `(opus)`; label bullet; Costs paragraph |
| `scripts/setup-pipeline-labels.sh:12` | label description: "Opus" → deeper review |
| `.github/workflows/agent-planner.yml` | **none** — already Opus |

`README.md:134` only lists the label name, so it needs no edit.

**The coder cannot push `.github/workflows/`.** Per `agent-coder.yml:132-134` it
must write the workflow edit to `pipeline/137/workflow-changes.patch`, revert the
file, and commit the patch; a human applies it before merge. The README and
script edits commit normally.

## Approach

1. **Job-level depth flag.** In `agent-pr-review.yml`, add to the job's `env:`
   `DEEP: ${{ contains(github.event.pull_request.labels.*.name, 'agent:deep-review') }}`.
   Set `timeout-minutes: ${{ contains(github.event.pull_request.labels.*.name, 'agent:deep-review') && 20 || 10 }}`
   — the `env` context is unavailable in job-level keys, so this expression repeats.
2. **Delete the `model` step** (lines 63-67) and hardcode `model: opus` in the
   `claude-run` step. Change `max_turns: 35` to
   `${{ contains(github.event.pull_request.labels.*.name, 'agent:deep-review') && 60 || 35 }}`.
3. **Widen the diff cap under deep review.** In "Resolve issue and diff range",
   replace the fixed `head -n 6000` with an `if [[ "$DEEP" == "true" ]]` picking
   20000 or 6000. Use an `if`, not `cap=$(... || ...)` — the step runs under
   `set -euo pipefail`.
4. **Add a depth paragraph to the prompt.** Build `$DEPTH_NOTE` in the "Build
   prompt" step and interpolate it after check 4. Standard: unchanged text.
   Deep: line-by-line correctness and security audit of every hunk, read
   surrounding code freely, word cap 150 → 400. The `PIPELINE-VERDICT:` line and
   the `## PR review` header stay identical in both — `Post review and advance
   state` greps for the verdict.
5. **Update the header comment** (lines 3-6): Opus always; `agent:deep-review`
   buys depth, not a model.
6. **Update the docs** in the same commit: `pipeline/README.md` diagram, the
   `agent:deep-review` bullet (line 38), the Costs paragraph (line 56), and the
   label description in `scripts/setup-pipeline-labels.sh`.

## Tests

No test framework covers GitHub Actions YAML here. Verify by:

1. `npx --yes actionlint .github/workflows/agent-pr-review.yml` — catches
   expression and shell errors in the changed file.
2. `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/agent-pr-review.yml'))"`
   as a fallback if actionlint will not install offline.
3. `bash -n scripts/setup-pipeline-labels.sh`.
4. Read back the generated patch: `git apply --check pipeline/137/workflow-changes.patch`.

The real check is the first PR after merge — its review comment should show
`pr-review (opus)` in the job summary's cost table.

## Touches backend

no

## Risks / open questions

1. **Deep review may still hit the wall.** 60 turns in 20 minutes on a 20000-line
   diff is optimistic. The cap is a soft stop (`bd57079`) and the stage falls back
   to the last assistant text, so the failure mode is a truncated review, not a
   lost one. Acceptable.
2. **Prompt drift between the two depths.** Two variants of the review
   instructions can diverge. Mitigated by keeping one prompt with a single
   interpolated `$DEPTH_NOTE` — do not fork the heredoc.
3. **Chose repoint over removal.** The issue allows either. Repointing keeps a
   working escape hatch for a PR a human already distrusts, and the label is
   already created by the setup script. If the reviewer prefers less surface,
   the alternative is: delete the label branch, delete `scripts/setup-pipeline-labels.sh:12`,
   drop the label bullet from both READMEs — about 15 minutes.
4. **Cost is unmeasured.** Every agent PR push now runs Opus. The per-run cost
   table in the job summary is the instrument; no budget alert is added here.

## Out of scope

- `agent-plan-reviewer` (sonnet) and `agent-docs` (sonnet). The plan reviewer is
  arguably a judgment stage too, but the issue names only the two, so leave it.
- `agent-coder`, `agent-triage`, `agent-orchestrator` (already Opus).
- `pipeline/README.md:55` says the coder gets 200 turns while `agent-coder.yml`
  and this issue say 400. Stale doc, unrelated fix, separate issue.
