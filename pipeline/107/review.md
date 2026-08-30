# Plan review — issue #107

## Findings

- Scope matches the issue precisely: coverage provider + config + script + CI wiring, explicitly no threshold/gate/badge, no new tests, nothing under `frontend/`. Confirmed no `thresholds` key is planned and the issue's "must never fail the build" requirement is honored (`continue-on-error: true` on the report-comment step, plus a `pull_request` guard).
- Spot-checked the concrete claims the plan relies on, all correct:
  - `backend/vitest.config.ts` today is exactly `{ test: { environment: "node", include: ["src/**/*.test.ts"] } }` — matches.
  - `backend/eslint.config.js` line 9 is the top-level `ignores: ["dist/**", "node_modules/**", "drizzle/**"]` array — matches.
  - `backend/.prettierignore` does not yet contain `coverage/`; `backend/.gitignore` already does — matches.
  - `.github/workflows/ci.yml` line 71 is `- run: npm test`, and the `changes` job's path filter already includes `backend/**` and `.github/workflows/ci.yml` — matches.
  - `backend/src/db/seed.ts` (file) and `backend/src/db/seed/` (directory: `run.ts`, `wipe.ts`, `households.ts`, `carriers.ts`, `financials.ts`, `users.ts`, `rng.ts`) both exist, so excluding both from coverage (deviating from the issue's single `src/db/seed.ts` reference) is correct and the issue's dead `src/db/migrations/**` glob is rightly dropped since only `backend/drizzle/` (non-`.ts`) exists.
  - `vitest: "^4.1.10"` in `backend/package.json` — pinning `@vitest/coverage-v8@4.1.10` to match is correct.
- One stale factual claim in the "Open question" about `src/jobs/**`: the plan says the scheduler "is disabled under `DEMO_MODE` (see recent commits)," but `git log` shows that behavior was added in #99/#104 and then reverted in #106 (`ad5292a`), and grepping `src/jobs` for `DEMO_MODE` today finds nothing. The plan's actual decision (leave `src/jobs/**` in scope) is unaffected by this — it's a minor inaccuracy in the rationale, not the outcome — so not blocking, but worth a heads-up.
- Direction fit is a slight stretch — PROJECT.md's Direction item 1 names wiring the *frontend* suite into CI, not backend coverage — but the plan is honest about that ("adjacent CI-quality work," not claiming direct alignment) and the work is infrastructure that touches no product pillar, so it's not a wrong-direction problem.
- Security posture is fine: job-level `permissions:` is scoped down to `contents: read, pull-requests: write` (correctly noting job-level permissions replace rather than merge with defaults), the fork-PR token limitation is identified and mitigated, and no secrets, auth, or session-handling code is touched.
- Tests: appropriately none added — this is a reporting layer over the existing 29 test files, and the plan explicitly calls out running the suite via `TestContext`/random-suffix fixtures against the shared DB without seeding, consistent with CLAUDE.md conventions.
- Conventions: no CLAUDE.md violations. File list and approach reuse existing patterns (existing `test` script, existing ESLint/Prettier ignore mechanisms, existing CI job structure) rather than introducing new tooling patterns.

## Required changes (if rejected)

None.

Verdict: approved
