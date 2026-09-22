#!/usr/bin/env bash
# Retained test for agent-docs' PR-body builder (issue #155).
#
# Extracts the "Open PR" step's body-building shell block straight out of
# .github/workflows/agent-docs.yml (no copy of the block lives here), renders it
# twice against the fixtures under testdata/pipeline/9999/ — once with a
# workflow-changes.patch present, once without — and asserts the shape described
# in pipeline/155/plan.md.
#
# Run directly:
#   bash .github/tests/pr-body.test.sh
#
# Regenerate the no-patch golden after a deliberate change to the PR-body block:
#   REGENERATE=1 bash .github/tests/pr-body.test.sh
# Then hand-review the new golden against agent-docs.yml:159-191 before committing —
# the harness that generates the golden is the same one this test uses to check it,
# so only a human catches a bug the two would otherwise agree on forever.
#
# CI runs this in ci.yml's pipeline-actions job, on changes under
# .github/workflows/** and .github/tests/**.
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd "$here/../.." && pwd)
agent_docs="$repo_root/.github/workflows/agent-docs.yml"
fixture_dir="$here/testdata/pipeline/9999"
golden="$here/testdata/pr-body-no-patch.golden.md"
golden_marker='<!-- golden content follows -->'

failures=0
check() { # check <description> <exit-status>
  if [[ "$2" == "0" ]]; then
    echo "ok   — $1"
  else
    echo "FAIL — $1"
    failures=$((failures + 1))
  fi
}
is() { # is <description> <actual> <expected>
  if [[ "$2" == "$3" ]]; then
    echo "ok   — $1"
  else
    echo "FAIL — $1"
    echo "       want: $3"
    echo "       got:  $2"
    failures=$((failures + 1))
  fi
}

# --- extract the block straight out of agent-docs.yml --------------------------
# The block is a literal `run: |` scalar, so its shell text is the YAML text
# verbatim: no YAML parser needed. The anchors are the exact start/end lines of
# the block in agent-docs.yml as of #147 (8d43ad6) — renaming the "Open PR" step
# is safe, but restructuring the `{ … } > file` redirect or the `PATCH=` line
# breaks extraction, on purpose and loudly.
start_pattern='^[[:space:]]*PATCH="pipeline/\$ISSUE/workflow-changes\.patch"[[:space:]]*$'
end_pattern='^[[:space:]]*} > "\$RUNNER_TEMP/pr-body\.md"[[:space:]]*$'

start_matches=$(grep -nE "$start_pattern" "$agent_docs")
end_matches=$(grep -nE "$end_pattern" "$agent_docs")

if [[ -z "$start_matches" ]]; then
  echo "FAIL — start anchor not found in $agent_docs: expected a line matching PATCH=\"pipeline/\$ISSUE/workflow-changes.patch\""
  exit 1
fi
if [[ $(wc -l <<<"$start_matches") -ne 1 ]]; then
  echo "FAIL — start anchor is not unique in $agent_docs"
  exit 1
fi
if [[ -z "$end_matches" ]]; then
  echo "FAIL — end anchor not found in $agent_docs: expected a line matching } > \"\$RUNNER_TEMP/pr-body.md\""
  exit 1
fi
if [[ $(wc -l <<<"$end_matches") -ne 1 ]]; then
  echo "FAIL — end anchor is not unique in $agent_docs"
  exit 1
fi

start_line=${start_matches%%:*}
end_line=${end_matches%%:*}

if (( end_line < start_line )); then
  echo "FAIL — end anchor (line $end_line) appears before start anchor (line $start_line) in $agent_docs"
  exit 1
fi

block_file=$(mktemp)
nopatch_dir=$(mktemp -d)
patch_dir=$(mktemp -d)
golden_content=$(mktemp)
trap 'rm -rf "$block_file" "$nopatch_dir" "$patch_dir" "$golden_content"' EXIT

sed -n "${start_line},${end_line}p" "$agent_docs" > "$block_file"

if [[ ! -s "$block_file" ]]; then
  echo "FAIL — extracted block from $agent_docs (lines $start_line-$end_line) is empty"
  exit 1
fi

# --- render the block against the fixtures --------------------------------------
render() { # render <with-patch: 0|1> <output-dir>
  local with_patch="$1" out_dir="$2"
  local work="$out_dir/work"
  mkdir -p "$work/repo/pipeline/9999"
  cp "$fixture_dir/plan.md" "$work/repo/pipeline/9999/plan.md"
  cp "$fixture_dir/notes.md" "$work/repo/pipeline/9999/notes.md"
  if [[ "$with_patch" == "1" ]]; then
    echo "fixture patch — content is irrelevant, only its presence matters" \
      > "$work/repo/pipeline/9999/workflow-changes.patch"
  fi
  # The block ends before `gh pr create`, so this never calls gh and never hits
  # the network.
  { echo "set -euo pipefail"; cat "$block_file"; } > "$work/body-block.sh"
  ( cd "$work/repo" && ISSUE=9999 BRANCH=agent/issue-9999 RUNNER_TEMP="$work" bash "$work/body-block.sh" )
}

if render 0 "$nopatch_dir"; then
  check "no-patch render runs without error" 0
else
  check "no-patch render runs without error" 1
fi

if render 1 "$patch_dir"; then
  check "patch-present render runs without error" 0
else
  check "patch-present render runs without error" 1
fi

nopatch_body="$nopatch_dir/work/pr-body.md"
patch_body="$patch_dir/work/pr-body.md"

if [[ ! -s "$nopatch_body" ]]; then
  echo "FAIL — no-patch render produced no pr-body.md"
  failures=$((failures + 1))
fi
if [[ ! -s "$patch_body" ]]; then
  echo "FAIL — patch-present render produced no pr-body.md"
  failures=$((failures + 1))
fi

if [[ "${REGENERATE:-}" == "1" ]]; then
  {
    echo "<!-- Regenerate with: REGENERATE=1 bash .github/tests/pr-body.test.sh -->"
    echo "<!-- Hand-review the new golden against agent-docs.yml:159-191 before committing: -->"
    echo "<!-- the harness that generates this file is the same one that checks it. -->"
    echo "$golden_marker"
    cat "$nopatch_body"
  } > "$golden"
  echo "wrote $golden"
  exit 0
fi

# --- assert: patch present (Goal items 2 and 4) ---------------------------------
is "patch present: body starts with Refs #9999" \
  "$(head -n1 "$patch_body")" "Refs #9999"

if grep -q 'Fixes #9999' "$patch_body"; then
  check "patch present: body contains no Fixes #9999" 1
else
  check "patch present: body contains no Fixes #9999" 0
fi

apply_heading_line=$(grep -n '^## Apply the workflow patch before merging$' "$patch_body" | head -n1 | cut -d: -f1)
plan_summary_line=$(grep -n '^## Plan summary$' "$patch_body" | head -n1 | cut -d: -f1)

if [[ -n "$apply_heading_line" && -n "$plan_summary_line" && "$apply_heading_line" -lt "$plan_summary_line" ]]; then
  check "patch present: apply-patch heading sits above ## Plan summary" 0
else
  check "patch present: apply-patch heading sits above ## Plan summary" 1
fi

if grep -q 'git apply' "$patch_body"; then check_git_apply=0; else check_git_apply=1; fi
check "patch present: apply instructions contain git apply" "$check_git_apply"

if grep -q 'git rm' "$patch_body"; then check_git_rm=0; else check_git_rm=1; fi
check "patch present: apply instructions contain git rm" "$check_git_rm"

if grep -q 'git push' "$patch_body"; then check_git_push=0; else check_git_push=1; fi
check "patch present: apply instructions contain git push" "$check_git_push"

# --- assert: patch absent (Goal items 1 and 3) -----------------------------------
is "no patch: body starts with Fixes #9999" \
  "$(head -n1 "$nopatch_body")" "Fixes #9999"

if [[ ! -f "$golden" ]]; then
  echo "FAIL — golden file missing at $golden"
  echo "       Create it with: REGENERATE=1 bash .github/tests/pr-body.test.sh"
  failures=$((failures + 1))
else
  sed -n "/^${golden_marker//\//\\/}\$/,\$p" "$golden" | tail -n +2 > "$golden_content"
  diff_output=$(diff -u "$golden_content" "$nopatch_body")
  if [[ -z "$diff_output" ]]; then
    check "no patch: body matches golden byte for byte" 0
  else
    echo "FAIL — no patch: body does not match golden ($golden)"
    echo "$diff_output"
    echo "       If this change is intentional, regenerate with:"
    echo "         REGENERATE=1 bash .github/tests/pr-body.test.sh"
    echo "       then hand-review the diff against agent-docs.yml:159-191 before committing."
    failures=$((failures + 1))
  fi
fi

echo
if [[ "$failures" -gt 0 ]]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
