# Coder notes — issue #147

## Apply the workflow patch before merging

```
gh pr checkout agent/issue-147
git apply pipeline/147/workflow-changes.patch
git add -A .github/workflows && git commit -m 'apply workflow patch for #147' && git push
```

## Implemented

`.github/workflows/agent-docs.yml`, "Open PR" step: the PR body now branches on
whether `pipeline/$ISSUE/workflow-changes.patch` exists.

- Patch present → body starts `Refs #$ISSUE`, followed by an "Apply the workflow
  patch before merging" section with the exact `gh pr checkout` / `git apply` /
  `git add && commit && push` commands, placed above `## Plan summary`.
- Patch absent → body is byte-identical to the old code (`Fixes #$ISSUE`, blank line,
  the usual "Automated implementation..." line).

Saved as `pipeline/147/workflow-changes.patch` because this runner's token can't push
`.github/workflows/`. The working `.github/workflows/agent-docs.yml` in this branch is
back at `origin/main`'s content — apply the patch above before merging this PR.

Also updated `pipeline/README.md`'s artifacts table: the `workflow-changes.patch` row
now notes that its presence flips the PR body to `Refs` instead of `Fixes`.

## Decisions

- Used `$BRANCH` (already in scope as a job-level env var) rather than a PR number in
  `gh pr checkout`, since the PR doesn't exist yet at that point in the script — matches
  plan *Approach* step 2.
- Kept the patch-check as `[[ -f "$PATCH" ]]` against the working tree, not
  `git cat-file -e HEAD:$PATCH`. Plan risk #3 confirmed these are equivalent here: the
  "Commit docs" step's `git clean -fd -e docs -e README.md` (line 117) can only remove
  the patch if it were never committed, and `agent-coder.yml` always commits it before
  this stage runs.

## Deviations

None. Implemented exactly what plan.md scoped.

## For the docs stage / reviewer

- Rendered both PR bodies with a scratch harness (fixture `plan.md`/`notes.md`, `ISSUE=147`,
  `BRANCH=agent/issue-147`) before saving the patch:
  - No-patch render: byte-identical (`diff` clean) to the same block extracted from
    `origin/main`'s `agent-docs.yml` — acceptance criterion #2.
  - With-patch render: starts `Refs #147`, apply-instructions section sits above
    `## Plan summary` — acceptance criteria #1 and #3.
- `git apply --check` on the saved patch against a copy of `origin/main`'s
  `agent-docs.yml` applies cleanly.
- This PR itself carries the patch and currently says `Fixes #147` in its body (the old
  code path, since the patch isn't applied to the workflow file in this branch) — the
  bug this issue fixes, present in its own PR. Apply the patch before merging (commands
  at top of this file and in *Approach* step 5 of the plan).

## Checks run

- `actionlint .github/workflows/agent-docs.yml` (installed via `go install
  github.com/rhysd/actionlint/cmd/actionlint@latest`): clean, no findings.
- Render harness described above: both cases pass.
- `git apply --check`: patch applies cleanly to `origin/main`'s workflow file.
- No backend or frontend files touched — those suites not run, per plan scope.
