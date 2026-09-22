<!-- Regenerate with: REGENERATE=1 bash .github/tests/pr-body.test.sh -->
<!-- Hand-review the new golden against the "Open PR" step in agent-docs.yml -->
<!-- before committing: the harness that generates this file also checks it. -->
<!-- golden content follows -->
Fixes #9999

Automated implementation by the agent pipeline. Plan, plan review and execution notes are in `pipeline/9999/`.

## Plan summary
## Goal

Exercise the `## Goal` … `## Files` extraction that `agent-docs.yml`'s "Open PR" step
uses to build the "## Plan summary" section of a PR body.

A second paragraph, to check that the extraction carries multi-line content and not
just a single line.

## Approach

1. Fixture step one.
2. Fixture step two.


## Notes
# Coder notes — issue #9999 (fixture)

Fixture for `.github/tests/pr-body.test.sh` (issue #155). 45 lines total, to
exercise the `sed -n '1,40p'` cap agent-docs.yml applies when it builds the
"## Notes" section of a PR body.

## Implemented

Fixture body line 9.
Fixture body line 10.
Fixture body line 11.
Fixture body line 12.
Fixture body line 13.
Fixture body line 14.
Fixture body line 15.
Fixture body line 16.
Fixture body line 17.
Fixture body line 18.
Fixture body line 19.
Fixture body line 20.
Fixture body line 21.
Fixture body line 22.
Fixture body line 23.
Fixture body line 24.
Fixture body line 25.
Fixture body line 26.
Fixture body line 27.
Fixture body line 28.
Fixture body line 29.
Fixture body line 30.
Fixture body line 31.
Fixture body line 32.
Fixture body line 33.
Fixture body line 34.
Fixture body line 35.
Fixture body line 36.
Fixture body line 37.
Fixture body line 38.
Fixture body line 39.
Line 40 — the last line that should appear in a rendered PR body.
