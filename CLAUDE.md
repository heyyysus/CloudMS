# CLAUDE.md

## Writing for humans

**Rule: every artifact a person reads is shaped by the `i-have-adhd` skill.**
Plans, plan reviews, PR bodies and PR review comments, issue comments,
`pipeline/<n>/notes.md`, docs changes, commit messages, and the summary you end
a session with. The reader has ADHD: prose that buries the action costs them
the task, so this is a correctness requirement, not a style preference.

**Read `.claude/skills/i-have-adhd/SKILL.md` before you write any of them.**
It is vendored into this repo, so it is in every checkout and on every CI
runner, and each pipeline stage carries the `Read` tool to open it. That file
is the rules; everything below is only how they land here. In a local session
with the plugin installed (`i-have-adhd@i-have-adhd`, enabled in
`.claude/settings.json`), `/i-have-adhd:i-have-adhd` loads the same content.

### Length budgets

**Every artifact below has a hard word budget. Over budget is a defect, the
same as a missing section heading.** The skill makes writing skimmable; the
budget is what stops a skimmable artifact from being three screens long
anyway. Count words before you commit — `wc -w` on the file, or on the body
you are about to post.

| artifact | budget | over-budget fix |
|---|---|---|
| `pipeline/<n>/plan.md` | **450 words** (650 if `risk:high`) | cut Approach prose to numbered one-liners |
| `pipeline/<n>/notes.md` | **250 words** | cut Decisions to the ones that change future work |
| `pipeline/<n>/review.md` | **150 words** | one line per finding, drop the agreeing ones |
| PR review comment | **150 words** (250 with `agent:deep-review`) | already capped in the prompt |
| `pr-fixer` round comment | **120 words** (200 when escalating) | list the fixes, not the reasoning |
| `agent-authored` issue body | **250 words** | the change and the acceptance, nothing else |
| issue comment, orchestrator log entry | **80 words** | |
| commit message body | **60 words** | |

The budget covers the whole file or comment, headings included. A required
section with nothing to say gets one line — "None." beats a paragraph
explaining that there is nothing.

### Cut these five things first

They are where the length actually goes. In order:

1. **Restating the input.** The reader has the issue open. A plan's Goal says
   what *done* looks like; it does not re-narrate the problem. A review does
   not summarize the plan before judging it.
2. **Defending a decision nobody questioned.** "Used `grep` rather than `awk`
   — same effect, easier to name each failure mode" is two lines spent on a
   choice with no consequence. Record a decision only when it constrains what
   someone does next.
3. **Narrating the process.** "I ran the test, then reverted, then confirmed"
   is a transcript. Report the outcome: "Negative control passes."
4. **The rationale paragraph under a bullet that already said it.** If the
   bullet is clear, the paragraph is padding. If the paragraph is needed, the
   bullet was wrong — fix the bullet.
5. **Saying it twice in two sections.** The apply-patch commands belong in the
   PR body *or* in `notes.md`, not both. Facts repeat across artifacts only
   when each reader sees only one of them.

Prefer a table over prose for anything with more than two parallel items:
paths, checks run, options weighed.

### What outranks the skill

- **A required format wins; the shape stays.** `plan.md`'s section headings,
  the `Verdict: approved|rejected` line in `review.md`, the
  `PIPELINE-VERDICT:` line in a PR review, a word cap — the workflows parse
  all of these. Meet the contract, and apply the rules inside it.
- **Machine-read output is exempt.** The triage stage answers with one line of
  JSON and nothing else. Anything a script parses stays parseable.
- **"Explain" or "walk me through" means explain.** Run as long as the topic
  needs, with headers to skim back over. Still no preamble, still no closer.
- **A destructive action gets a confirmation first**, however much text that
  takes. Safety outranks brevity.
- **Real ambiguity gets one clarifying question**, not a guess.

## Multi-tenancy

Every repository function takes `orgId` as its first argument, and filters by
it — that's isolation layer 1. Row-level security is layer 2, the backstop:
never import `adminDb` outside `db/`, `jobs/`, and the seed (an ESLint rule
enforces this); everywhere else, `db` resolves through the current request's
org context. Route handlers run inside that context automatically
(`requireAuth` opens it); anything that calls a repository outside a request —
a script, a test — must wrap the call in `runInOrg`. See
`docs/multitenancy.md`.

## Concurrent agents

**Rule: every task must be safe to run while other agents are working in this
same repo, at the same time.** Never assume you are the only agent here. The
working tree, the Postgres container, and the dev-server ports are all shared,
and another agent may change any of them in the middle of your task.

### Never touch shared global git state

- **Never `git checkout` / `git switch` a branch in the main working tree.**
  Another agent's uncommitted work lives there, and moving HEAD under them
  makes their tests pass or fail against code they never wrote.
- **Never `git stash`.** There is one global stash stack. Another agent's
  `stash pop` will take your entry.
- Re-read `git branch --show-current` and `git status` immediately before you
  stage or commit. A reading from earlier in your session is already stale.

### Work in a worktree

Anything needing its own branch gets its own worktree under
`.claude/worktrees/` (gitignored, already reserved for this):

```
git worktree add .claude/worktrees/<branch> -b <branch>
cp backend/.env .claude/worktrees/<branch>/backend/.env   # .env is gitignored
(cd .claude/worktrees/<branch>/backend && npm install)
```

Clean up when merged: `git worktree remove .claude/worktrees/<branch>`.

### The Postgres container is shared

One container (`cloudms-db-1`, host port 5433), one `myapp` database, every
agent. A worktree gives you isolated *files*, not an isolated database.

- **Never run `npm run db:seed`.** It wipes every table, including the fixtures
  another agent's test run is mid-way through using.
- **Never `docker compose down`, `stop`, or `restart db`.**
- `npx tsx src/db/bootstrap.ts` (`npm run db:bootstrap`) is insert-if-absent
  and idempotent, so it is safe to run against the shared database; say in
  your summary that you ran it. `npm run db:push` is **not** safe against the
  shared database — it applies whatever destructive DDL is needed to make the
  schema match `schema.ts` on whatever database `DATABASE_ADMIN_URL` points
  at, with no confirmation prompt. Only run it against your own database (see
  below).
- In tests, use `TestContext` from `src/routes/testHelpers.ts`. Its fixtures
  carry random unique suffixes precisely so parallel runs don't collide, and
  `ctx.cleanup()` deletes only rows that context created. Never truncate a
  table and never assert on a global row count — both break under concurrency.
- For anything genuinely destructive (seeding, a reset, a schema experiment,
  or running `db:push`), **make your own database** rather than using the
  shared one. Inline `DATABASE_ADMIN_URL`/`DATABASE_URL` override
  `backend/.env`, since `dotenv` does not clobber variables already present in
  the environment:

  ```
  docker compose exec -T db createdb -U postgres myapp_<agent>
  cd backend
  export DATABASE_ADMIN_URL=postgresql://postgres:password@localhost:5433/myapp_<agent>
  export DATABASE_URL=postgresql://app:password@localhost:5433/myapp_<agent>
  npm run db:push
  npm run db:bootstrap
  npx vitest run
  ```

  Drop it when you're done: `docker compose exec -T db dropdb -U postgres myapp_<agent>`.

### Ports

The backend honors `PORT` (default 8000). Vite serves :5173 and its `/api/v1`
proxy target is **hardcoded** to `http://localhost:8000` in
`frontend/vite.config.ts`, so only one agent can run the full stack at a time.
Check whether a server is already up before starting one, and prefer `vitest` +
`curl` over long-running dev servers.

### Don't write into shared paths

- Temp files go in your own session scratchpad — never `/tmp`, never a path
  inside the repo.
- `backend/src/scripts/mint-session.ts`, which the `verify` skill tells you to
  create, is a fixed path two agents will clobber. Use a unique filename.

## Pushing to GitHub

**Push with the GitHub API, not `git push`.** A `git push` from an agent
session is committed by the `claude` bot, and GitHub creates **no workflow
runs** for it — CI, Frontend and `agent-pr-review` all skip silently, so the PR
keeps showing checks from an older commit while its head moves on. Pushing
through the REST API (`push_files` / `create_or_update_file`) commits as the
authenticated user and does fire the workflows.

- **Verify every API push.** The API takes file contents as strings rather
  than a diff, so confirm the transfer landed what you tested:
  `git fetch origin <branch> && git diff HEAD origin/<branch>` against the tree
  you actually ran the checks on. Empty output means it was clean.
- **Get it right the first time — there is no re-run button.** No pipeline
  workflow declares `workflow_dispatch`, and re-running a `pull_request` run
  replays the original event's SHA, not the new head. Recovering from a
  no-event push takes a human closing and reopening the PR.
- `agent-pr-review.yml` also skips `[bot]` actors on purpose, so a bot push
  would not retrigger review even if it did emit events.

### No attribution in commits or PRs

Commits and pull requests are the repository's own history, not a byline.

- No `Co-Authored-By` trailer, no "Generated by …" line, no tool or model name
  in a commit message, PR title or PR body.
- Commit messages describe the change and why, in the repo's existing voice.
  The same goes for a PR body: what changed, what it affects, what was
  verified.
- This is about commits and PRs. It does not change what the pipeline stages
  write in their own review comments (verdict lines, `pipeline-reviewed`
  markers), which the workflows depend on.
