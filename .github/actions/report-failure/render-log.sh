#!/usr/bin/env bash
# Renders the tail of a plain shell log as text that a failure comment can quote:
# secrets redacted, capped in size.
#
#   render-log.sh <log-file>     # writes the tail to stdout
#
# Capped at 20 lines, 500 chars per line and 4000 chars overall, and the output
# always ends with exactly one newline: it is printed into a markdown fence, where
# a truncated last line would run into the closing backticks and break the
# rendering. render-log.test.sh covers both caps and the newline.
set -uo pipefail

log_file=${1:?usage: render-log.sh <log-file>}

MAX_LINES=20
MAX_LINE_CHARS=500
MAX_CHARS=4000

# Same token shapes as claude-run/render-tail.sh: classic GitHub tokens,
# fine-grained ones (`github_pat_…`, the shape of PIPELINE_BOT_TOKEN), and
# Anthropic keys (`sk-ant-…`).
REDACT='s/gh[pousr]_[A-Za-z0-9]{20,}/[REDACTED]/g; s/github_pat_[A-Za-z0-9_]{20,}/[REDACTED]/g; s/sk-ant-[A-Za-z0-9_-]{20,}/[REDACTED]/g'

rendered=""
if [[ -f "$log_file" ]]; then
  rendered=$(tail -n "$MAX_LINES" "$log_file" \
    | cut -c"1-$MAX_LINE_CHARS" \
    | sed -E "$REDACT" \
    | head -c "$MAX_CHARS")
fi

# The command substitution strips trailing newlines; printf puts exactly one back,
# so a mid-line cut by `head -c` still leaves a well-formed last line.
if [[ -n "$rendered" ]]; then
  printf '%s\n' "$rendered"
fi
exit 0
