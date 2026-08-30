# CLAUDE.md

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
- `npx tsx src/db/migrate.ts` is additive and idempotent, so it is safe to run;
  say in your summary that you ran it.
- In tests, use `TestContext` from `src/routes/testHelpers.ts`. Its fixtures
  carry random unique suffixes precisely so parallel runs don't collide, and
  `ctx.cleanup()` deletes only rows that context created. Never truncate a
  table and never assert on a global row count — both break under concurrency.
- For anything genuinely destructive (seeding, a reset, a schema experiment),
  **make your own database** rather than using the shared one. An inline
  `DATABASE_URL` overrides `backend/.env`, since `dotenv` does not clobber
  variables already present in the environment:

  ```
  docker compose exec -T db createdb -U postgres myapp_<agent>
  cd backend
  export DATABASE_URL=postgresql://postgres:password@localhost:5433/myapp_<agent>
  npx tsx src/db/migrate.ts
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
