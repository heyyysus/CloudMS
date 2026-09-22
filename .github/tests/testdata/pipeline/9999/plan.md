---
issue: 9999
status: plan-approved
---
# Fixture plan for pr-body.test.sh

This file is a fixture for `.github/tests/pr-body.test.sh` (issue #155). It is not a
real plan and issue #9999 does not exist — that is deliberate, so a stray `Fixes #9999`
in the golden can never match a real issue.

## Goal

Exercise the `## Goal` … `## Files` extraction that `agent-docs.yml`'s "Open PR" step
uses to build the "## Plan summary" section of a PR body.

A second paragraph, to check that the extraction carries multi-line content and not
just a single line.

## Approach

1. Fixture step one.
2. Fixture step two.

## Files

| path | change |
|---|---|
| `fixture.txt` | new — not a real file |
