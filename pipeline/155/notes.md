# Coder notes — issue #155

## The workflow patch is not applied

`pipeline/155/workflow-changes.patch` carries the `ci.yml` wiring (this runner's
token cannot push `.github/workflows/`). A human must apply it before merging:

```
gh pr checkout agent/issue-155
git apply pipeline/155/workflow-changes.patch
git rm pipeline/155/workflow-changes.patch
git add -A .github/workflows && git commit -m 'apply workflow patch for #155' && git push
```

Until then, run `bash .github/tests/pr-body.test.sh` manually in CI-equivalent checks —
it is not yet wired into `ci.yml` on this branch.

## Implemented

- `.github/tests/pr-body.test.sh` — extracts the "Open PR" body-building block
  straight out of `.github/workflows/agent-docs.yml` (lines 159-191, via unique
  line anchors, no copy of the block in the test), renders it twice against
  fixtures (patch present / absent), and asserts all four Goal items from
  `pipeline/155/plan.md`.
- `.github/tests/testdata/pipeline/9999/plan.md`, `notes.md` — fixtures. Issue
  `9999` is fake on purpose, so a stray `Fixes #9999` can never match a real
  issue. `notes.md` is 45 lines to exercise the 40-line cap the real "Open PR"
  step applies.
- `.github/tests/testdata/pr-body-no-patch.golden.md` — golden for the no-patch
  render, generated from `agent-docs.yml` at `8d43ad6` (after #151 landed) with
  `REGENERATE=1 bash .github/tests/pr-body.test.sh`, then hand-read against
  `agent-docs.yml:159-191` before committing.
- `pipeline/155/workflow-changes.patch` — the `ci.yml` wiring (see above): widens
  the `changes` filter's `actions` section from `.github/actions/**` +
  `.github/workflows/ci.yml` to `.github/actions/**` + `.github/workflows/**` +
  `.github/tests/**`, and adds a fourth `pipeline-actions` step running the new
  test.

## Decisions

- Extraction uses `grep -n` for the two anchor lines plus `sed -n` to slice the
  range, not `awk` as plan *Approach* step 1 sketches — same effect (unique,
  trimmed-line anchors; loud abort on 0 or >1 matches or an empty extraction),
  easier to make each failure mode a separate, named check.
- Golden file carries a 3-line HTML-comment header (regenerate command +
  hand-review reminder) above a `<!-- golden content follows -->` marker; the
  test strips everything through that marker before diffing, so the header
  itself never has to match the rendered body byte-for-byte.
- `ci.yml`'s `actions` filter keeps `.github/actions/**` (plan step 5 lists it
  as staying) alongside the two new entries — three lines total, not the two
  the plan's prose names, because the existing `.github/actions/**` line was
  never meant to be dropped.

## Deviations

None. Implemented exactly what plan.md scoped; `agent-docs.yml` untouched.

## For the docs stage / reviewer

- Negative control (plan *Tests* item 2): added a stray `echo "x"` inside
  `agent-docs.yml`'s no-patch branch, re-ran the test — golden check failed with
  a readable `diff -u` and the regenerate hint, confirming the golden test can
  actually fail. Reverted with `git checkout -- .github/workflows/agent-docs.yml`
  (confirmed clean after) before making the real `ci.yml` edit below.
- This PR's own body says `Refs #155`, not `Fixes #155` — the patch above is the
  workflow change #155 itself, exactly the case the golden's "patch present"
  branch covers, live.
- `.github/tests/` is a new top-level dir, breaking from action-colocated
  `*.test.sh` (`report-failure/`, `claude-run/`). Plan and review both call this
  out and justify it: no `action.yml` to sit beside, since the code under test
  is an inline workflow step, not an action.

## Checks run

- `bash .github/tests/pr-body.test.sh`: all 10 checks pass.
- `bash -n .github/tests/pr-body.test.sh`: clean.
- `shellcheck .github/tests/pr-body.test.sh`: clean (added two
  `# shellcheck disable=SC2016` on the anchor patterns, whose `\$` is
  intentionally literal — same convention as `render-headline.test.sh`).
- `actionlint .github/workflows/ci.yml` (with the patch applied): clean.
  `actionlint .github/workflows/*.yml` still reports two pre-existing findings
  in `agent-orchestrator.yml` and `agent-plan-reviewer.yml`, both untouched by
  this issue.
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`
  (with the patch applied): parses.
- `git apply --check pipeline/155/workflow-changes.patch`: applies cleanly.
- Negative control: see "For the docs stage / reviewer" above.
- No backend or frontend files touched, so vitest and the frontend suite were
  not run, per plan scope.
