#!/usr/bin/env bash
# Creates (or updates) every label the agent pipeline uses. Idempotent.
# Usage: scripts/setup-pipeline-labels.sh [owner/repo]
set -euo pipefail

repo="${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}"

label() { gh label create "$1" --repo "$repo" --color "$2" --description "$3" --force; }

# Opt-in / control
label "agent"                  "0E8A16" "Opt-in: run the automated agent pipeline on this issue"
label "agent:deep-review"      "5319E7" "Use Opus for the PR review of this PR (manual opt-in)"
label "needs-human"            "B60205" "Pipeline halted; a human must look at this"

# Pipeline state machine (one active at a time)
label "pipeline:needs-plan"    "C5DEF5" "Waiting for the planner"
label "pipeline:plan-ready"    "C5DEF5" "Plan written; waiting for plan review"
label "pipeline:plan-approved" "BFD4F2" "Plan approved; waiting for the coder"
label "pipeline:in-progress"   "1D76DB" "Coder is implementing"
label "pipeline:docs"          "1D76DB" "Docs stage running"
label "pipeline:pr-open"       "0052CC" "PR opened; waiting for PR review"
label "pipeline:pr-reviewed"   "0052CC" "PR reviewed; waiting for human merge"
label "pipeline:abandoned"     "D93F0B" "PR closed without merging"

# Triage (area). Type labels reuse GitHub defaults: bug, enhancement, documentation, question.
label "area:backend"           "FBCA04" "Touches backend/"
label "area:frontend"          "FBCA04" "Touches frontend/"
label "area:infra"             "FBCA04" "CI, deploy, docker, nginx, scripts"

echo "Labels ready on $repo"
