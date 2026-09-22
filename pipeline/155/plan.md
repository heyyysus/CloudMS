---
issue: 155
status: pending-review
---
# Retained test for agent-docs' PR-body builder

## Goal

`bash .github/tests/pr-body.test.sh` passes locally and in CI, and fails if anyone
edits the PR-body block in `.github/workflows/agent-docs.yml` (lines 159-191) in a way
that changes the no-patch body.

Done means all four hold:

1. The test extracts the body block straight out of `agent-docs.yml` — no copy of the
   block lives in the test.
2. Patch present → body starts `Refs #<n>`, contains no `Fixes #<n>`, and the "Apply the
   workflow patch before merging" heading sits above `## Plan summary`.
3. Patch absent → body starts `Fixes #<n>` and matches a committed golden file byte for
   byte.
4. The apply commands contain `git apply`, `git rm` and a `git push`.

CI runs it in `ci.yml`'s `pipeline-actions` job, and that job now triggers on changes
under `.github/workflows/**`.

## Scope check

Pipeline infrastructure, not a product pillar — it protects the tooling that ships every
other roadmap item, and touches no app code. PROJECT.md's **Direction** list is
unaffected.

**`risk:high` looks wrong.** The triage rules reserve it for changes that can break
production; this adds one test script, three fixtures and a two-line CI filter edit, with
no backend, no frontend and no deploy path touched. `risk:low` fits. `enhancement`,
`agent`, `area:infra` and `agent-authored` are right.

## Files / areas

| path | change |
|---|---|
| `.github/tests/pr-body.test.sh` | **new** — extracts the block, renders both cases, asserts |
| `.github/tests/testdata/pr-body-no-patch.golden.md` | **new** — the byte-for-byte golden |
| `.github/tests/testdata/pipeline/9999/plan.md` | **new** — fixture with `## Goal` … `## Files` |
| `.github/tests/testdata/pipeline/9999/notes.md` | **new** — fixture, 45 lines, to exercise the 40-line cap |
| `.github/workflows/ci.yml` | `changes` filter + one `pipeline-actions` step — **goes in a patch, see below** |

`.github/workflows/agent-docs.yml` is **read only**. Nothing in it changes.

**The `ci.yml` edit cannot be pushed by the coder.** Per `agent-coder.yml:132-134`, write
it to `pipeline/155/workflow-changes.patch`, revert `ci.yml`, and commit the patch. That
flips this PR's own body to `Refs #155` — which is the patch branch this issue is adding
a test for, so the reviewer sees it live.

Fixture issue number is `9999`, so a stray `Fixes #9999` in the golden can never match a
real issue.

## Approach

1. **Extract the block.** In `pr-body.test.sh`, pull lines from
   `PATCH="pipeline/$ISSUE/workflow-changes.patch"` through `} > "$RUNNER_TEMP/pr-body.md"`
   out of `.github/workflows/agent-docs.yml` with an `awk` range over the trimmed line
   content (so re-indenting the step does not break it). It is a literal `run: |` block
   scalar, so the YAML text is the shell text verbatim — no YAML parser needed, and the
   test stays runnable on a dev machine with nothing but bash. Abort with exit 1 and a
   named reason if either anchor is missing or the extraction is empty; a silent empty
   extraction would turn every assertion into a vacuous pass.
2. **Render.** Write the snippet to `$work/body-block.sh` with `set -euo pipefail`
   prepended, then run it from a fixture root:
   `(cd "$work/repo" && ISSUE=9999 BRANCH=agent/issue-9999 RUNNER_TEMP="$work" bash "$work/body-block.sh")`.
   `$work/repo/pipeline/9999/{plan.md,notes.md}` are copies of the fixtures. The block
   ends before `gh pr create`, so nothing calls `gh` and nothing hits the network.
   Render twice: once with `pipeline/9999/workflow-changes.patch` present, once without.
3. **Assert.** Reuse the `check`/`is` helper shape and the `ok — ` / `FAIL — ` output of
   `.github/actions/report-failure/render-headline.test.sh`, plus its
   `failures`-counter-then-`exit 1` ending. Order-of-sections check is
   `grep -n` line numbers: the "Apply the workflow patch" heading's number must be lower
   than `## Plan summary`'s. Golden compare is `diff -u golden actual` so a failure prints
   the diff.
4. **Generate the golden.** Add a `REGENERATE=1` mode that writes the no-patch render to
   the golden path instead of comparing, and document it in the script's header comment
   and in a comment at the top of the golden file. Generate the golden from `agent-docs.yml`
   as it stands on `main` at branch time — `8d43ad6` or later, i.e. after #151 landed —
   and record that sha in `pipeline/155/notes.md`. Then read the golden against
   `agent-docs.yml:159-191` by hand before committing: the harness generated it, so the
   review pass is what stops a harness bug from being frozen in as "correct".
5. **Wire CI** (this is the patch). In `ci.yml`'s `changes` filter, `actions` section:
   replace `- '.github/workflows/ci.yml'` with `- '.github/workflows/**'` and add
   `- '.github/tests/**'`. Then add a fourth step to `pipeline-actions`:
   `- name: agent-docs PR body` / `run: bash .github/tests/pr-body.test.sh`.

## Tests

The deliverable is the test. Run these before committing:

1. `bash .github/tests/pr-body.test.sh` — all checks pass.
2. Negative control: add a stray `echo "x"` inside the `else` branch of
   `agent-docs.yml`'s block, re-run, confirm the golden check fails, then revert the edit.
   A golden test that cannot fail is worth nothing; record the result in `notes.md`.
3. `bash -n .github/tests/pr-body.test.sh`, and `actionlint`/YAML parse over the patched
   `ci.yml` (see `pipeline/147/notes.md` for how #147 installed actionlint).
4. `git apply --check pipeline/155/workflow-changes.patch` before committing the patch.

The other three `pipeline-actions` tests must still pass — they are unchanged, but the
widened filter means they now run on workflow-only PRs.

No backend or frontend files change, so vitest and the frontend suite are not run.

## Touches backend

no

## Risks / open questions

1. **The golden is generated by the code it tests.** A bug in the extraction bakes into
   the golden and both sides agree forever. Mitigated by step 4's hand-review, and by
   assertions 2 and 4 in Goal, which are content checks that do not consult the golden.
2. **Two filter lines, not one.** The issue scoped "one line in `ci.yml`'s `changes`
   filter". Because the test lives at `.github/tests/`, `.github/workflows/**` alone
   would not re-run it when the test itself changes. Hence the second entry. If the
   reviewer prefers one line, the alternative is moving the test under
   `.github/actions/**`, which is already filtered — but it is not an action, and there
   is no `action.yml` to put beside it.
3. **A legitimate body change now needs two commits' worth of thought** — the workflow
   edit plus a `REGENERATE=1` run. That is the point of the test, but it is friction, so
   the regenerate command must be discoverable from the failure output. Print it in the
   golden-mismatch failure message.
4. **The extraction anchors are the coupling.** Renaming the `Open PR` step is safe;
   renaming the `PATCH` variable or restructuring the `{ … } > file` redirect breaks
   extraction. That fails loudly by design (step 1), and the error message should name
   `agent-docs.yml` and both anchors.

No open questions — the issue specifies the three assertions and the golden's provenance.

## Out of scope

- Any change to `agent-docs.yml` itself, including its body text.
- Testing the other `run:` blocks in `agent-docs.yml` (diff prep, prompt build, commit).
- The `gh pr create` call, the label flip, and the `report-failure` steps.
- Testing the other pipeline workflows' shell blocks. If this shape works, that is a
  separate issue.
