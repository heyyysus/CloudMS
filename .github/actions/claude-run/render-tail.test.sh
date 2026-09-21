#!/usr/bin/env bash
# Fixture test for render-tail.sh. Run it directly:
#
#   bash .github/actions/claude-run/render-tail.test.sh
#
# CI runs it on every change under .github/actions/** (ci.yml, job `pipeline-actions`).
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
render="$here/render-tail.sh"
fixture="$here/testdata/execution-sample.json"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

failures=0
check() { # check <description> <condition-result>
  if [[ "$2" == "0" ]]; then
    echo "ok   — $1"
  else
    echo "FAIL — $1"
    failures=$((failures + 1))
  fi
}
ends_with_newline() { [[ -s "$1" && -z "$(tail -c 1 "$1")" ]]; }

# --- the sample transcript -------------------------------------------------
out="$work/sample.txt"
bash "$render" "$fixture" > "$out"
status=$?
check "exits 0 on the sample transcript" "$status"
check "renders something" "$([[ -s "$out" ]] && echo 0 || echo 1)"
check "output ends with a newline" "$(ends_with_newline "$out" && echo 0 || echo 1)"
check "assistant text is rendered, first line only" \
  "$(grep -qxF "[assistant] I'll check the failing test first." "$out" && echo 0 || echo 1)"
check "tool calls are rendered with their command" \
  "$(grep -qxF '[tool] Bash: npm test -- --reporter=dot' "$out" && echo 0 || echo 1)"
check "string tool results are rendered" \
  "$(grep -q '^\[tool-result\] auth token leaked' "$out" && echo 0 || echo 1)"
check "block tool results are rendered" \
  "$(grep -q '^\[tool-result\] env dump:' "$out" && echo 0 || echo 1)"
check "classic GitHub tokens are redacted" \
  "$(! grep -q 'ghp_ABCDEFGHIJ' "$out" && echo 0 || echo 1)"
check "fine-grained GitHub tokens are redacted" \
  "$(! grep -q 'github_pat_11ABCDEFG' "$out" && echo 0 || echo 1)"
check "Anthropic tokens are redacted" \
  "$(! grep -q 'sk-ant-oat01-AbCdEfGh' "$out" && echo 0 || echo 1)"
check "redaction leaves a marker" \
  "$(grep -q '\[REDACTED\]' "$out" && echo 0 || echo 1)"

# --- the 20-line cap -------------------------------------------------------
# 30 copies of the sample's first assistant event, so only the cap decides the count.
many="$work/many.json"
jq '[ (.[] | select(.type=="assistant")) ][0] as $a | [range(30) | $a]' "$fixture" > "$many"
out_many="$work/many.txt"
bash "$render" "$many" > "$out_many"
check "caps the transcript at 20 lines" \
  "$([[ "$(wc -l < "$out_many")" -eq 20 ]] && echo 0 || echo 1)"

# --- the per-line and total caps -------------------------------------------
# 30 events of 800 chars each: every line is cut to 500, and 20 x 500 overshoots the
# 4000-char total cap, so the last line is truncated mid-line. It must still end in a
# newline — claude-run cats this into a $GITHUB_OUTPUT heredoc, and a last line running
# into the closing delimiter fails the parse step and loses stop_reason for the stage.
long="$work/long.json"
jq -n '[ range(30) | { type: "assistant", message: { role: "assistant",
  content: [ { type: "text", text: ("x" * 800) } ] } } ]' > "$long"
out_long="$work/long.txt"
bash "$render" "$long" > "$out_long"
check "caps each line at 500 chars" \
  "$([[ "$(awk '{ if (length($0) > 500) c++ } END { print c + 0 }' "$out_long")" -eq 0 ]] && echo 0 || echo 1)"
check "caps the whole tail at ~4000 chars" \
  "$([[ "$(wc -c < "$out_long")" -le 4001 ]] && echo 0 || echo 1)"
check "a mid-line cut still ends with a newline" \
  "$(ends_with_newline "$out_long" && echo 0 || echo 1)"

# --- degenerate inputs -----------------------------------------------------
empty="$work/empty.json"
echo '[]' > "$empty"
out_empty="$work/empty.txt"
bash "$render" "$empty" > "$out_empty"
check "exits 0 on a transcript with no renderable events" "$?"
check "renders nothing for it" \
  "$([[ ! -s "$out_empty" ]] && echo 0 || echo 1)"

if [[ "$failures" -gt 0 ]]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
