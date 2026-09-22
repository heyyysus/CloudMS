#!/usr/bin/env bash
# Fixture test for render-headline.sh. Run it directly:
#
#   bash .github/actions/report-failure/render-headline.test.sh
#
# CI runs it on every change under .github/actions/** (ci.yml, job `pipeline-actions`).
#
# The expected headlines are single-quoted because their backticks are literal
# markdown, not command substitution.
# shellcheck disable=SC2016
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
render="$here/render-headline.sh"

failures=0
check() { # check <description> <condition-result>
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

# --- the failure path (every caller that passes no `outcome`) -----------------
is "a failed stage names the failed step" \
  "$(bash "$render" coder failed 'Run Claude' error_max_turns)" \
  '**coder stage failed** — step "Run Claude", stop reason `error_max_turns`.'

is "a failed stage with no known step says \"step unknown\"" \
  "$(bash "$render" coder failed '' error_max_turns)" \
  '**coder stage failed** — step "step unknown", stop reason `error_max_turns`.'

is "an empty stop reason renders as \`unknown\`" \
  "$(bash "$render" coder failed 'Run Claude' '')" \
  '**coder stage failed** — step "Run Claude", stop reason `unknown`.'

# --- the notice path (agent-docs' "stopped early but opened the PR anyway") ---
# The point of the `outcome` input: on a success path no step has conclusion
# `failure`, so naming one would invent a failure that did not happen.
is "a stage that stopped early drops the step clause, keeping the em dash" \
  "$(bash "$render" docs 'stopped early' '' error_max_turns)" \
  '**docs stage stopped early** — stop reason `error_max_turns`.'

is "a non-failed outcome still shows a step when one is known" \
  "$(bash "$render" docs 'stopped early' 'Open PR' error_max_turns)" \
  '**docs stage stopped early** — step "Open PR", stop reason `error_max_turns`.'

# --- defaults and exit status -------------------------------------------------
is "outcome defaults to \"failed\"" \
  "$(bash "$render" coder)" \
  '**coder stage failed** — step "step unknown", stop reason `unknown`.'

bash "$render" docs 'stopped early' '' '' > /dev/null
check "exits 0 on the no-step path" "$?"

if bash "$render" > /dev/null 2>&1; then no_stage=1; else no_stage=0; fi
check "exits non-zero without a stage" "$no_stage"

if [[ "$failures" -gt 0 ]]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "all checks passed"
