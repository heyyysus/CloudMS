---
issue: 83
status: pending-review
---
# Document the agent pipeline and its label setup script in README.md

## Goal

`README.md` gains a short **Agent pipeline** section that:

1. States that issues labelled `agent` are run through an automated GitHub Actions
   pipeline (plan → plan review → code → docs → PR → PR review), with merging the PR
   as the only human gate.
2. Links to the pipeline's own docs for the full story — **`pipeline/README.md`**, not
   `.claude/pipeline/README.md` as the issue text says (see Risks).
3. Explains that `scripts/setup-pipeline-labels.sh` creates/updates every label the
   pipeline depends on (`agent`, `pipeline:*`, `needs-human`, `area:*`), that it is
   idempotent, that it needs `gh` authenticated, and that it is a one-time setup step
   for the repo (or a new fork).

Done means: the section exists in `README.md`, every path and link it names resolves in
the repo, and no non-doc file changes.

## Scope check

Not a product-pillar item — this is repo/contributor documentation, so it sits outside
the five numbered items in PROJECT.md's *Direction*. It is nonetheless in-scope
housekeeping: PR #82 added the pipeline and #85 moved its artifacts out of `.claude/`,
and neither updated the top-level README, so the pipeline is currently undiscoverable
from the entry-point doc. `README.md` explicitly scopes itself to "configuring and
running it", which a one-time repo setup script fits.

Triage labels: `documentation`, `agent` and `pipeline:needs-plan` are right.
`area:infra` is defensible-but-loose — the script and workflows being documented are
infra, but the only file changed is a root-level Markdown doc, so nothing under
`scripts/`, `.github/` or the Docker/nginx config is touched. No change requested; just
noting the label overstates the blast radius.

## Files / areas

- `README.md` — **the only file to change.** Add one new `##` section.
- Read-only references (do not edit):
  - `pipeline/README.md` — the target of the link; source of truth for stage names,
    labels, and the "Setup (once)" list.
  - `scripts/setup-pipeline-labels.sh` — source of truth for what the script does.
  - `.github/workflows/agent-*.yml` — stage names, if the section names any.

## Approach

1. **Placement.** Insert the new section after `## Before opening a PR` and before
   `## Deployment`. Rationale: the README currently runs setup → run → pre-PR checks →
   deployment; the pipeline is contributor workflow, so it belongs with the pre-PR
   material rather than after the deploy/rollback instructions. Keep it as a single
   `##` heading named `## Agent pipeline`, matching the h1 of `pipeline/README.md`.

2. **Content**, matching the README's existing voice (prose paragraphs, fenced `bash`
   blocks, relative links like `[PROJECT.md](./PROJECT.md)`):
   - One paragraph: issues opened by a CODEOWNER and labelled `agent` are taken through
     an unattended pipeline in GitHub Actions — planner, plan review, coder, docs, PR,
     PR review — with per-issue artifacts (`plan.md`, `review.md`, `notes.md`) committed
     under `pipeline/<issue-number>/` on branch `agent/issue-<n>`. Link
     `[pipeline/README.md](./pipeline/README.md)` as the full reference (stage table,
     label meanings, resuming a halted run, costs).
   - One short paragraph + code block for the labels script:

     ```bash
     scripts/setup-pipeline-labels.sh          # defaults to the current repo
     scripts/setup-pipeline-labels.sh owner/repo
     ```

     Say it creates or updates (via `gh label create --force`, so it is safe to re-run)
     the `agent`, `pipeline:*`, `needs-human`, `agent:deep-review` and `area:*` labels
     the workflows key off, that it requires the GitHub CLI authenticated with label
     write access, and that it only needs running once per repo — the workflows will not
     chain correctly until the labels exist.
   - Mention the two required secrets by name only (`CLAUDE_CODE_OAUTH_TOKEN`,
     `PIPELINE_BOT_TOKEN`) with a pointer to `pipeline/README.md` for details, rather
     than duplicating the setup list. Keep the README the index; keep
     `pipeline/README.md` the detail.

3. **Do not** restate the stage-by-stage table or the label glossary in `README.md` —
   two copies will drift. Three to four short paragraphs total is the target length,
   in line with the other README sections.

4. **Verify before finishing:** confirm `./pipeline/README.md` and
   `./scripts/setup-pipeline-labels.sh` exist at the paths written, and that every label
   name quoted appears in `scripts/setup-pipeline-labels.sh`.

## Tests

No automated tests. This is a Markdown-only change to a file outside every CI path
filter — `ci.yml`'s `paths-filter` covers `backend/**`, `nginx/**`, `scripts/**`, the
compose files and `ci.yml` itself, so a `README.md`-only PR skips the backend job
entirely; `frontend.yml` only triggers under `frontend/**`. Nothing to run.

Manual check instead:

- Re-read the rendered section for the README's heading level and link style.
- `ls pipeline/README.md scripts/setup-pipeline-labels.sh` to confirm the linked paths.
- `grep` each quoted label name against `scripts/setup-pipeline-labels.sh`.

## Touches backend

no

## Risks / open questions

- **The path in the issue body is stale.** The issue says `.claude/pipeline/README.md`,
  but commit f56847a (PR #85, "move artifacts out of `.claude/`") relocated it to
  `pipeline/README.md`; `.claude/pipeline/` no longer exists. Link the real path. If the
  reviewer disagrees and wants the issue text honoured literally, the link would be dead
  on merge — flagging rather than silently choosing is the point here.
- Duplicating detail from `pipeline/README.md` into `README.md` creates drift. Mitigated
  by keeping the README section a pointer, not a copy.
- The script's default `gh repo view` branch means running it without arguments outside a
  repo checkout fails; worth one clause in the docs, not a code change.

## Out of scope

- Any change to `scripts/setup-pipeline-labels.sh`, the `.github/workflows/agent-*.yml`
  workflows, or `pipeline/README.md` itself.
- Adding a `docs/` page for the pipeline, or restructuring `README.md`'s existing
  sections.
- Documenting the `agent:deep-review` / `/code-review ultra` review flows in depth, or
  CODEOWNERS setup.
- Updating `PROJECT.md` — the pipeline is tooling, not product state.
