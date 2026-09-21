#!/usr/bin/env bash
# Renders the tail of a claude-code execution file as plain text that a failure
# comment can quote: one line per event, newest last, secrets redacted.
#
#   render-tail.sh <execution-file>     # writes the tail to stdout
#
# Capped at 20 lines, 500 chars per line and 4000 chars overall, and the output
# always ends with exactly one newline: claude-run writes it into a $GITHUB_OUTPUT
# heredoc, where a truncated last line would run into the closing delimiter and
# fail the whole parse step. render-tail.test.sh covers both caps and the newline.
set -uo pipefail

exec_file=${1:?usage: render-tail.sh <execution-file>}

MAX_LINES=20
MAX_LINE_CHARS=500
MAX_CHARS=4000

# A tool result is the likeliest place a leaked secret shows up, and GitHub masks
# registered secrets in run logs only — not in text posted with `gh issue comment`.
# So redact every token shape the pipeline handles: classic GitHub tokens,
# fine-grained ones (`github_pat_…`, the shape of PIPELINE_BOT_TOKEN), and Anthropic
# keys, which covers CLAUDE_CODE_OAUTH_TOKEN's `sk-ant-oat…` too.
REDACT='s/gh[pousr]_[A-Za-z0-9]{20,}/[REDACTED]/g; s/github_pat_[A-Za-z0-9_]{20,}/[REDACTED]/g; s/sk-ant-[A-Za-z0-9_-]{20,}/[REDACTED]/g'

rendered=$(jq -r '
  [ .[] |
    (
      if .type == "assistant" then
        (.message.content // []) | map(
          if .type == "text" then "[assistant] " + ((.text // "") | split("\n")[0])
          elif .type == "tool_use" then
            "[tool] " + .name + ": " + (
              ((.input.command // .input.file_path // .input.pattern // "") | tostring)
              | split("\n")[0]
            )
          else empty end
        )
      elif .type == "user" then
        (.message.content // []) | map(
          if .type == "tool_result" then
            "[tool-result] " + (
              (if (.content | type) == "string" then .content
               else ((.content // []) | map(.text // "") | join(" ")) end)
              | split("\n")[0]
            )
          else empty end
        )
      else [] end
    )
  ] | flatten | .[]
' "$exec_file" \
  | tail -n "$MAX_LINES" \
  | cut -c"1-$MAX_LINE_CHARS" \
  | sed -E "$REDACT" \
  | head -c "$MAX_CHARS")

# The command substitution strips trailing newlines; printf puts exactly one back,
# so a mid-line cut by `head -c` still leaves a well-formed last line.
if [[ -n "$rendered" ]]; then
  printf '%s\n' "$rendered"
fi
exit 0
