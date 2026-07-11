#!/bin/bash
# PreToolUse hook: before any Bash call, if it's a `git commit` whose staged
# files touch backend/, run the backend test suite and block the commit
# (exit 2) if tests fail.

input=$(cat)
command=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" <<< "$input")

case "$command" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" || exit 0

staged_backend=$(git diff --cached --name-only -- backend/)
[[ -z "$staged_backend" ]] && exit 0

echo "Staged changes touch backend/ — running backend tests before allowing commit..." >&2

if ! (cd backend && npm test); then
  echo "Backend tests failed. Commit blocked." >&2
  exit 2
fi

exit 0
