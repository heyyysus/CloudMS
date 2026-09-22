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

## Round 1 fixes (pr-fixer)

Run `bash .github/actions/report-failure/render-headline.test.sh` — the headline
logic now has a harness, and the missing separator is gone.

1. **Missing ` — ` on the no-step path.** The notice headline rendered
   `**docs stage stopped early** stop reason \`x\`.` — recorded as expected output
   in "For the docs stage / reviewer" above, so the defect shipped documented.
   Corrected to `**docs stage stopped early** — stop reason \`x\`.`
2. **Headline logic extracted to `render-headline.sh`**, mirroring how
   `render-log.sh` was extracted, so it can be tested. `action.yml` calls it with
   `$STAGE $OUTCOME $failed_step $STOP_REASON`; the `step unknown` fallback moved
   into the script with the rest of the rule.
3. **New `render-headline.test.sh`** — 9 checks, both outcomes, the fallback, the
   empty stop reason, the exit status. Verified it fails against the pre-fix
   logic: reinstating the old two-line `line=...` block fails exactly the
   "keeping the em dash" check, 1 of 9.
4. **Drift guard in `render-log.test.sh`** — asserts `REDACT=` is identical to
   `claude-run/render-tail.sh`'s. Answers the review's "the two redaction lists
   can now drift apart silently" without merging the renderers, which
   `$GITHUB_ACTION_PATH` being per-action makes awkward. Verified it fails when
   one list is edited alone.
5. **`workflow-changes.patch` gained the third `pipeline-actions` step** for
   `render-headline.test.sh`. Re-checked with `git apply --check`, applies clean.

Not fixed: the renderers still duplicate the caps and the `<details>` block.
Sharing them needs a third location both composite actions can resolve, which is
a bigger change than this round warrants — the drift guard covers the part that
can leak a secret.

Checks: `render-headline.test.sh` 9/9, `render-log.test.sh` 15/15,
`claude-run/render-tail.test.sh` 17/17, `shellcheck` clean on every
`report-failure/*.sh`, `action.yml` parses as YAML. No backend or frontend files
touched, so those suites don't apply.

## Round 2 fixes (pr-fixer)

Run `bash .github/actions/report-failure/render-log.test.sh` — the drift guard no
longer passes vacuously, and a broken headline renderer no longer prints a blank
line.

1. **Vacuous drift check** (`render-log.test.sh`). Both sides came from
   `grep -m1 '^REDACT='`, so renaming `REDACT=` in *both* renderers made both
   empty and the equality check pass comparing nothing. Each side is now asserted
   non-empty first. Verified: renaming `REDACT=` in both files fails 3 checks,
   where the old single check passed.
2. **Swallowed renderer failure** (`action.yml:76-80`). `render-headline.sh ... ||
   true` turned any renderer failure into an empty `headline`, printing a blank
   line where the comment's only claim goes. Now the failure (or empty output)
   degrades to `**$STAGE stage $OUTCOME** — see the run for details.` Verified
   against a missing renderer and a silent one.
3. **Third copy of the `failed` default** (`action.yml:78`). `${OUTCOME:-failed}`
   dropped; `outcome` now defaults in exactly two places, the action input and
   `render-headline.sh`.
4. **Redundant "no double space" check** dropped from
   `render-headline.test.sh` — the exact-string `is` four lines above already
   pinned the whole headline, and the grep matched any double space on the line.

Not fixed, unchanged from round 1: the renderers still duplicate the caps and the
`<details>` block.

Scope note from the review — `render-headline.sh` and its test go beyond plan.md's
"by inspection, no harness", as does the cross-action drift check. Both came from
round-1 review findings; recorded here rather than reverted.

Checks: `render-headline.test.sh` 8/8, `render-log.test.sh` 17/17,
`claude-run/render-tail.test.sh` 17/17, `shellcheck` clean on every
`report-failure/*.sh`, `action.yml` parses as YAML, `workflow-changes.patch`
applies clean. No backend or frontend files touched, so those suites don't apply.
