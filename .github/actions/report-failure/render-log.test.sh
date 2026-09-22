#!/usr/bin/env bash
# Fixture test for render-log.sh. Run it directly:
#
#   bash .github/actions/report-failure/render-log.test.sh
#
# CI runs it on every change under .github/actions/** (ci.yml, job `pipeline-actions`).
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
render="$here/render-log.sh"
fixture="$here/testdata/stage-sample.log"
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

# --- the sample log ---------------------------------------------------------
out="$work/sample.txt"
bash "$render" "$fixture" > "$out"
status=$?
check "exits 0 on the sample log" "$status"
check "renders something" "$([[ -s "$out" ]] && echo 0 || echo 1)"
check "output ends with a newline" "$(ends_with_newline "$out" && echo 0 || echo 1)"
check "the gh error is rendered" \
  "$(grep -qF 'gh: a pull request for branch' "$out" && echo 0 || echo 1)"
check "classic GitHub tokens are redacted" \
  "$(! grep -q 'ghp_ABCDEFGHIJ' "$out" && echo 0 || echo 1)"
check "redaction leaves a marker" \
  "$(grep -q '\[REDACTED\]' "$out" && echo 0 || echo 1)"

# --- the 20-line cap ---------------------------------------------------------
many="$work/many.log"
for _ in $(seq 1 30); do echo "a line of shell output"; done > "$many"
out_many="$work/many.txt"
bash "$render" "$many" > "$out_many"
check "caps the log at 20 lines" \
  "$([[ "$(wc -l < "$out_many")" -eq 20 ]] && echo 0 || echo 1)"

# --- the per-line and total caps ---------------------------------------------
# 30 lines of 800 chars each: every line is cut to 500, and 20 x 500 overshoots the
# 4000-char total cap, so the last line is truncated mid-line. It must still end in a
# newline — it is printed into a markdown fence, and a last line running into the
# closing backticks breaks the rendering.
long="$work/long.log"
for _ in $(seq 1 30); do printf 'x%.0s' $(seq 1 800); echo; done > "$long"
out_long="$work/long.txt"
bash "$render" "$long" > "$out_long"
check "caps each line at 500 chars" \
  "$([[ "$(awk '{ if (length($0) > 500) c++ } END { print c + 0 }' "$out_long")" -eq 0 ]] && echo 0 || echo 1)"
check "caps the whole tail at ~4000 chars" \
  "$([[ "$(wc -c < "$out_long")" -le 4001 ]] && echo 0 || echo 1)"
check "a mid-line cut still ends with a newline" \
  "$(ends_with_newline "$out_long" && echo 0 || echo 1)"

# --- degenerate inputs --------------------------------------------------------
empty="$work/empty.log"
: > "$empty"
out_empty="$work/empty.txt"
bash "$render" "$empty" > "$out_empty"
check "exits 0 on an empty file" "$?"
check "renders nothing for it" \
  "$([[ ! -s "$out_empty" ]] && echo 0 || echo 1)"

missing="$work/does-not-exist.log"
out_missing="$work/missing.txt"
bash "$render" "$missing" > "$out_missing"
check "exits 0 on a missing file" "$?"
check "renders nothing for it" \
  "$([[ ! -s "$out_missing" ]] && echo 0 || echo 1)"

# --- drift against claude-run's renderer ---------------------------------------
# The two renderers redact independently. A token shape added to one and not the
# other leaks from whichever stage uses the other, silently — so make the drift
# fail here instead. If they ever need to differ, delete this check deliberately.
tail_redact=$(grep -m1 '^REDACT=' "$here/../claude-run/render-tail.sh")
log_redact=$(grep -m1 '^REDACT=' "$here/render-log.sh")
# Both greps coming back empty — a rename of REDACT= in both files — would make the
# comparison below pass while comparing nothing, so assert each side exists first.
check "claude-run/render-tail.sh still declares REDACT=" \
  "$([[ -n "$tail_redact" ]] && echo 0 || echo 1)"
check "render-log.sh still declares REDACT=" \
  "$([[ -n "$log_redact" ]] && echo 0 || echo 1)"
check "the redaction list matches claude-run/render-tail.sh" \
  "$([[ -n "$tail_redact" && "$tail_redact" == "$log_redact" ]] && echo 0 || echo 1)"

if [[ "$failures" -gt 0 ]]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
