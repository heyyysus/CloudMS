# Agent pipeline

Issues opened by a CODEOWNER and labelled `agent` are taken through an unattended
pipeline in GitHub Actions. The only human gate is merging the resulting PR.

```
issue opened ──► agent-triage (haiku)      adds type + area:* labels        [every CODEOWNER issue]
+ `agent` ─────► agent-trigger             gate ✓ → pipeline:needs-plan
needs-plan ────► agent-planner (opus)      writes plan.md → pipeline:plan-ready
plan-ready ────► agent-plan-reviewer       writes review.md → plan-approved | needs-human
plan-approved ─► agent-coder (sonnet)      code + notes.md → pipeline:docs
docs ──────────► agent-docs (sonnet)       docs commit, opens PR → pipeline:pr-open
PR opened/push ► agent-pr-review (opus)    review comment → pipeline:pr-reviewed
merge ─────────► agent-cleanup             strips pipeline:* labels
```

## Artifacts (this directory)

Each issue gets `pipeline/<issue-number>/` on branch `agent/issue-<n>`:

| file | written by | contents |
|---|---|---|
| `plan.md` | planner | goal, files/areas, approach, test strategy, risks, out-of-scope |
| `review.md` | plan reviewer | feedback and a final `Verdict: approved` / `Verdict: rejected` line |
| `notes.md` | coder, docs | what was built, decisions, deviations from the plan, docs status |
| `workflow-changes.patch` | coder (only when needed) | changes under `.github/workflows/` the runner's token cannot push; a human applies them to the branch before merge. Its presence makes the PR body say `Refs #<n>` instead of `Fixes #<n>`, so merging does not close the issue |

They travel with the PR so the diff shows the full paper trail. The PR review itself
lives as a PR comment (marker `<!-- pipeline-reviewed: <sha> -->` tracks the last
reviewed commit so only new pushes are re-reviewed).

## Labels

- `agent` — you add this to start. Removing it mid-flight aborts at the next stage.
- `pipeline:*` — current stage; exactly one at a time. Set only by the workflows.
- `needs-human` — something stopped: plan rejected, a stage failed, a blocking
  security finding, or the PR was closed unmerged.
- `agent:deep-review` — put on a PR to make the PR review deeper: full line-by-line
  audit prompt, more turns and time, a bigger diff cap. PR review runs Opus either way.
- `area:*`, `bug`/`enhancement`/`documentation`/`question` — Haiku triage guesses.

## When a stage fails

The failure comment carries what happened, not just a link: the failed step, the
Claude stop reason (`error_max_turns`, etc. — empty if the stage failed before or
without running Claude), the run URL, up to ~20 redacted lines of the stage's output,
and a one-line resume instruction for that stage. The same body also lands in the job
summary (Actions → run → Summary). `agent-trigger` and `agent-triage` comment only —
neither necessarily means the issue is in the pipeline, so they never add
`needs-human`; every other stage does.

## Resuming / intervening

- **Plan rejected** (`needs-human`): edit `plan.md` on `agent/issue-<n>` by hand, then
  remove `needs-human` and add `pipeline:plan-approved` to run the coder.
- **Stage failed**: fix the cause, remove `needs-human`, re-add the `pipeline:*` label
  for the stage you want to run. Every stage is triggered purely by its label.
- **Coder hit its turn cap, was cancelled, or timed out**: whatever it had done is on
  `agent/issue-<n>`, uncommitted leftovers included, as a trailing `wip:` commit.
  Remove `needs-human` and re-add `pipeline:plan-approved`; the next run is told to
  continue from the branch. The planner, plan reviewer and docs stage checkpoint the
  same way — a `wip:` commit from one of them means `plan.md`, `review.md`, or the
  docs/notes are incomplete; treat them as a draft, not a finished artifact.
- **Abort**: remove `agent`.

## Costs

Each stage has `--max-turns` and a job `timeout-minutes` (the coder gets 200 turns and
90 minutes; every tool call is a turn). Every run writes a token / cost table to the job
summary (Actions → run → Summary). Opus runs the planner (once per issue) and the PR
review (once per push); `agent:deep-review` widens the PR review's turns, timeout, and
diff cap rather than switching models. `/code-review ultra` is never automated.

## Setup (once)

1. Secrets: `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`, bills your subscription), `PIPELINE_BOT_TOKEN` (fine-grained PAT, this repo:
   Issues RW, Pull requests RW, Contents read-only). Labels applied with the default
   `GITHUB_TOKEN` do not trigger other workflows, so every chaining label write uses the PAT.
2. `scripts/setup-pipeline-labels.sh`
3. Repo setting: delete branch on merge.
4. Anthropic Console spend alert.
