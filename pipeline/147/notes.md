# Coder notes — issue #147

## The workflow patch is applied

`.github/workflows/agent-docs.yml` carries the change directly, and
`pipeline/147/workflow-changes.patch` has been deleted rather than left behind to be
applied a second time. This PR's `Fixes #147` is therefore accurate: merging it puts
the fix on `main`.

That is the whole point of this issue. The PR was opened saying `Fixes #147` over a
diff with no workflow change in it — #147 reproducing its own bug — because the guard
it adds was not yet on `main` when `agent-docs` wrote the body. The next patch-carrying
PR will say `Refs`.

## Implemented

`.github/workflows/agent-docs.yml`, "Open PR" step: the PR body now branches on
whether `pipeline/$ISSUE/workflow-changes.patch` exists.

- Patch present → body starts `Refs #$ISSUE`, followed by an "Apply the workflow
  patch before merging" section with the exact `gh pr checkout` / `git apply` /
  `git add && commit && push` commands, placed above `## Plan summary`.
- Patch absent → body is byte-identical to the old code (`Fixes #$ISSUE`, blank line,
  the usual "Automated implementation..." line).

It was first saved as `pipeline/147/workflow-changes.patch` because the coder's token
cannot push `.github/workflows/`; the patch has since been applied to the real file and
deleted.

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
- Both renders re-run after the patch was applied to the real workflow file, against the
  final `agent-docs.yml` on this branch: `Refs #147` with a patch present, `Fixes #147`
  without, and the no-patch body still byte-identical to main's.
- This PR was opened saying `Fixes #147` over a diff containing no workflow change — the
  bug this issue fixes, reproduced in its own PR, because the guard was not on `main` yet
  when `agent-docs` wrote the body. The patch is now applied here, so `Fixes #147` is
  accurate and there is nothing left to apply before merging.

## Checks run

- `actionlint .github/workflows/agent-docs.yml` (installed via `go install
  github.com/rhysd/actionlint/cmd/actionlint@latest`): clean, no findings.
- Render harness described above: both cases pass, before and after applying the patch.
- YAML parse plus `bash -n` over every `run:` block in the final `agent-docs.yml`: clean.
- No backend or frontend files touched — those suites not run, per plan scope.

## Docs

No doc changes needed — the fix only changes `agent-docs.yml`'s PR-body
generation (internal pipeline tooling), not user-facing app behaviour or the
API surface.
