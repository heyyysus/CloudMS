---
issue: 147
status: pending-review
---
# PR body says `Refs #<n>` when the branch carries an unapplied workflow patch

## Goal

Edit one step — **Open PR**, `.github/workflows/agent-docs.yml:161-171` — so the PR
body branches on whether `pipeline/$ISSUE/workflow-changes.patch` exists.

Done when all three of the issue's acceptance criteria hold:

1. A branch **with** the patch file → body starts `Refs #<n>`, and merging leaves the
   issue open.
2. A branch **without** it → body is byte-identical to today's (`Fixes #<n>`, blank
   line, "Automated implementation by the agent pipeline…").
3. The apply instructions — patch path plus three commands — sit **above** `## Plan
   summary` in a patch-carrying body.

Estimated 20 minutes: ~12 lines of bash, plus a render harness to prove #2.

## Scope check

No PROJECT.md pillar, no roadmap item. This is maintenance on the pipeline that builds
the roadmap, same shape as #124 and #137, and the payoff is direct: #137 closed with
its fix unapplied, and a human spent #146 re-doing it by hand.

**Triage labels are right, with one redundancy.** `area:infra` and `risk:high` are
correct — `agent-triage` classifies any `.github/workflows/**` edit high regardless of
diff size, and that label governs, so the size target in the orchestrator's §4 is
halved (~7 files). This plan touches 4, two of which are pipeline artifacts. `bug` is
the accurate type; `enhancement` is also applied and is redundant, not wrong. Not worth
a relabel.

**This issue hits its own bug.** The fix lives at the one path the coder's token cannot
push, so its PR will carry `pipeline/147/workflow-changes.patch` and a body that still
says `Fixes #147`. Apply the patch before merging — the commands are in *Approach* step 5.

## Files / areas

| path | change |
|---|---|
| `.github/workflows/agent-docs.yml` | **Open PR** step, lines 161-171: patch-aware body |
| `pipeline/147/workflow-changes.patch` | that same edit, saved for a human (coder token can't push `.github/workflows/`) |
| `pipeline/README.md` | one line in the artifacts table: a patch-carrying PR says `Refs`, not `Fixes` |
| `pipeline/147/notes.md` | coder notes, including both rendered bodies verbatim |

No backend, no frontend, no `docs/`.

## Approach

1. **Wrap the first two lines of the body in a branch.** In `agent-docs.yml`, inside
   the `else` at line 160, before the `{ … } > "$RUNNER_TEMP/pr-body.md"` block:

   ```bash
   PATCH="pipeline/$ISSUE/workflow-changes.patch"
   ```

   Then replace `echo "Fixes #$ISSUE"; echo` (lines 162-163) with:

   ```bash
   if [[ -f "$PATCH" ]]; then
     # Refs, not Fixes: the workflow change is not in this diff, so an auto-close
     # on merge would close the issue with the fix unapplied (#137 → #144 → #147).
     echo "Refs #$ISSUE"
     echo
     echo "## Apply the workflow patch before merging"
     echo
     echo "The workflow change for this issue is **not in this diff**. It is saved as \`$PATCH\`. Apply it, then merge:"
     echo
     echo '```'
     echo "gh pr checkout $BRANCH"
     echo "git apply $PATCH"
     echo "git add -A .github/workflows && git commit -m 'apply workflow patch for #$ISSUE' && git push"
     echo '```'
     echo
   else
     echo "Fixes #$ISSUE"
     echo
   fi
   ```

   Everything from `echo "Automated implementation…"` (line 164) down is untouched, so
   the apply block lands above `## Plan summary` and the no-patch body is unchanged.

2. **Use `$BRANCH`, not a PR number, in `gh pr checkout`.** The number does not exist
   until `gh pr create` runs on line 172, and `gh pr checkout` takes a branch name as
   well as a number. The alternative — create, then `gh pr edit --body-file` — costs a
   second API call and leaves a window where the body has no warning.

3. **Watch the quoting.** This `run:` block is plain bash (no heredoc layer, unlike
   "Build prompt"), and `set -euo pipefail` is on from line 157. Backticks inside
   double quotes are command substitution: escape them as `` \` `` exactly as line 164
   already does, and use single quotes for the ``` fence lines. This is the most
   likely way to break the step; step 2 of *Tests* catches it.

4. **Add one row-note to `pipeline/README.md`**, in the `workflow-changes.patch` row of
   the artifacts table: the PR says `Refs #<n>` rather than `Fixes #<n>`, so merging it
   does not close the issue. This file is not under `.github/workflows/`, so the coder
   can push it directly — keep it out of the patch.

5. **Save the workflow edit as a patch** (`agent-coder.yml:134-137`), and put these
   exact commands at the top of `notes.md` so the merging human does not have to derive
   them:

   ```
   gh pr checkout agent/issue-147
   git apply pipeline/147/workflow-changes.patch
   git add -A .github/workflows && git commit -m 'apply workflow patch for #147' && git push
   ```

## Tests

No framework covers Actions YAML; #124 and #137 hit the same wall. In order:

1. `npx --yes actionlint .github/workflows/agent-docs.yml` — it runs shellcheck over
   `run:` bodies, which is what catches an unescaped backtick or an unquoted expansion.
2. **Render harness, the real check.** Copy the `{ … }` body block into a scratch
   script outside the repo, point it at fixture `plan.md` / `notes.md`, and run it
   three ways:
   - with the patch file present → assert `^Refs #`, no `Fixes #`, and that the apply
     block precedes `## Plan summary`;
   - without it → `cmp` against the same block rendered from
     `git show origin/main:.github/workflows/agent-docs.yml`. Must be byte-identical;
     that is acceptance criterion #2 and `cmp` is the proof.
3. `git apply --check pipeline/147/workflow-changes.patch` before committing the patch.
4. Paste both rendered bodies and the exact harness commands into `pipeline/147/notes.md`.

Backend suite: not run, nothing under `backend/` changes. The end-to-end check is the
next patch-carrying PR after this one merges.

## Touches backend

no

## Risks / open questions

1. **This PR will say `Fixes #147` and must not be merged as-is.** The old code writes
   the body; the new code is in the patch. Merging before applying closes this issue
   with the fix unapplied — the exact failure it fixes, a fourth time. *Approach* step 5
   has the commands.
2. **Quoting inside the `run:` block** is the one way to break the docs stage for every
   future issue, not just patch-carrying ones. Mitigated by actionlint plus the render
   harness; the plan reviewer should read the final bash, not just the diffstat.
3. **`[[ -f "$PATCH" ]]` tests the working tree, not the branch.** It is equivalent
   today because "Commit docs" runs `git clean -fd` (line 117) before this step, so an
   uncommitted patch cannot survive to here. If that ever changes, switch to
   `git cat-file -e "HEAD:$PATCH"`.
4. **An already-open PR never gets the new body.** Line 158 short-circuits with "PR
   already open", so a docs re-run on a branch that gained a patch afterwards leaves
   `Fixes` in place. Rare (the patch is written by the coder, before this stage) and out
   of scope — named here so it is not mistaken for a regression.
5. **Open question for the reviewer: extract the body builder to `.github/actions/`?**
   That directory is outside `workflows` scope, so the coder could push it, CI's
   existing `pipeline-actions` job would test it permanently (as it does
   `render-tail.test.sh`), and the patch would shrink to a one-line call-site. It also
   contradicts the issue's "One file, one step". This plan follows the issue. Say the
   word before the coder starts if you want the extraction instead — about 15 minutes more.

## Out of scope

- **Granting `workflows` scope to `PIPELINE_BOT_TOKEN`** — the root fix, which retires
  the patch dance and this guard with it. It is a secret only the owner can mint.
- `agent-coder.yml`'s patch escape hatch (lines 134-137): unchanged.
- Auto-applying the patch in CI, or having `agent-pr-review` judge patch contents rather
  than the diff.
- Any other `pipeline:*` stage, and the `if: failure()` blocks #124 rewired in this same
  file.

Next action: read *Approach* step 1's bash and say approve or reject — the open question
in *Risks* #5 is the only thing that changes the shape of the work.
