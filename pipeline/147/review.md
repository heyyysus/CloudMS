# Plan review — issue #147

## Findings

- Line references check out against the real files: `agent-docs.yml:161-171` (the `{ … } > pr-body.md` block, `Fixes #$ISSUE` at 162) and `agent-coder.yml:134-137` (the patch escape hatch) match exactly.
- `$BRANCH` is a job-level env var (`agent-docs.yml:26`), so it's already in scope at the "Open PR" step — the plan's `gh pr checkout $BRANCH` in the apply instructions is valid.
- Risk #3's claim about `git clean -fd -e docs -e README.md` (`agent-docs.yml:117`) is correct, and doesn't threaten the patch check: `agent-coder.yml:136` commits the patch before docs runs, so `[[ -f "$PATCH" ]]` is testing a committed file, not something `git clean` could remove.
- Scope is exactly the issue: one step, one branch condition, no-patch path byte-identical, apply instructions placed above `## Plan summary` per acceptance criterion 3.
- No security surface change — `$ISSUE`/`$BRANCH` are used unquoted in new code the same way the existing code already does; no new secret or auth path touched.
- Plan flags its own bootstrap bug (this PR will itself say `Fixes #147` and need manual patch application) and gives exact commands in *Approach* step 5 — consistent with the orchestrator's warning.
- Test plan (actionlint + a byte-diff render harness against `origin/main`) is the same workaround #124/#137 used for Actions YAML with no test framework coverage; adequate for this change's size.

## Required changes (if rejected)

N/A

Verdict: approved
