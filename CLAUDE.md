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
