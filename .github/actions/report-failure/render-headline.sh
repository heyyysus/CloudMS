#!/usr/bin/env bash
# Renders the one-line headline of a failure comment:
#
#   render-headline.sh <stage> <outcome> <failed-step> <stop-reason>
#
# e.g. `**coder stage failed** — step "Run Claude", stop reason `error_max_turns`.`
#
# The step clause is dropped when <failed-step> is empty, and "step unknown" is
# only substituted for an empty step when the outcome is "failed": a stage that
# stopped early succeeded, so no step has conclusion `failure` and naming one
# would be a lie. render-headline.test.sh covers both paths.
set -uo pipefail

stage=${1:?usage: render-headline.sh <stage> <outcome> <failed-step> <stop-reason>}
outcome=${2:-failed}
failed_step=${3:-}
stop_reason=${4:-}

if [[ "$outcome" == "failed" ]]; then
  failed_step="${failed_step:-step unknown}"
fi

# The format strings are single-quoted because their backticks are literal
# markdown, not command substitution.
# shellcheck disable=SC2016
if [[ -n "$failed_step" ]]; then
  printf '**%s stage %s** — step "%s", stop reason `%s`.\n' \
    "$stage" "$outcome" "$failed_step" "${stop_reason:-unknown}"
else
  printf '**%s stage %s** — stop reason `%s`.\n' \
    "$stage" "$outcome" "${stop_reason:-unknown}"
fi
exit 0
