---
name: test-agent
description: Live-test a PR with an Opus agent. Builds the PR's backend image, boots a fresh app + fresh Postgres, then proves tenant rows are protected at the database (RLS) and at the API (cross-org requests). Usage - /test-agent [PR number | branch] [--comment]. Default - the PR for the current branch.
---

# test-agent

Delegate the whole run to one agent: `Agent` with `subagent_type: general-purpose`,
`model: opus`. Give it this file's path plus the PR number, branch, repo root, and
the session scratchpad path. Relay its report to the user. Do not run the steps
yourself.

## Agent brief

You are testing one PR of CloudMS live. Read `CLAUDE.md` first: the repo, the
Postgres container `cloudms-db-1` and the dev ports are shared with other agents.
Never touch `cloudms-db-1`, never `npm run db:seed`, never `git checkout` in the
main tree, never `git stash`. Temp files go in the scratchpad path you were given.

### 1. Fresh stack from the PR
1. `git fetch origin <branch>`; `git worktree add .claude/worktrees/test-agent-<pr> origin/<branch>`.
2. Pick two free ports (`lsof -nP -iTCP:<port> -sTCP:LISTEN` is empty): one for
   Postgres, one for the app.
3. `docker run -d --name pg-test-agent-<pr>` from `postgres:18.4`, user `postgres`,
   password `password`, db `myapp`, published on `127.0.0.1:<pgport>`. Wait for `pg_isready`.
4. `docker build -t cloudms-test-agent-<pr> <worktree>/backend`.
5. Run the image as `cloudms-test-agent-<pr>` with its real `CMD`, env
   `DATABASE_ADMIN_URL=postgresql://postgres:password@host.docker.internal:<pgport>/myapp`,
   `DATABASE_URL=postgresql://app:password@host.docker.internal:<pgport>/myapp`,
   `APP_DB_PASSWORD=password`, `GOOGLE_CLIENT_ID=x`, `PORT=8000`, published on
   `127.0.0.1:<appport>`. Poll `/health` for up to 5 minutes. If it never answers,
   the verdict is **fail**: report the last 60 log lines and stop.

### 2. Seed two tenants
Insert directly as superuser via `docker exec pg-test-agent-<pr> psql`: organizations
`A` and `B`, one user per org, an `admin` membership each, and one session per
user inserted by SQL: `sessions.org_id` set to that user's org (`requireAuth` needs
it; the `verify` skill's mint script does not set it), `token_hash` = sha256 hex of
a random 32-byte hex token, `expires_at` an hour out. The raw token is the cookie.
Read `backend/src/db/schema.ts` for the exact columns; do not guess.

### 3. Checks (record each as pass/fail with the command)
| # | check | expected |
|---|---|---|
| 1 | `select count(*) from pg_policies` and forced-RLS table count | 21 and 21 |
| 2 | As A's session: `POST /carriers` (or another tenant table's create route), then `GET` it | 201, then 200 |
| 3 | As B's session: `GET` A's row by id, and the list route | 404, and A's row absent |
| 4 | `psql -U app` with no `app.org_id`: `select count(*)` on that table | 0, while superuser sees >= 1 |
| 5 | `psql -U app` with `set_config('app.org_id', <B>, false)` | 0 |
| 6 | `psql -U app` with `set_config('app.org_id', <A>, false)` | >= 1 (positive control) |
| 7 | `docker restart` the app container, wait for `/health`, repeat check 1 | still 21 and 21 |

Check 4 to 6 use the `app` role with `PGPASSWORD=password` against the published
port. Check 7 is the one that catches "push dropped the policies".

### 4. Clean up, always
`docker rm -f` both containers, `docker rmi` the image, `git worktree remove` the
worktree, delete your scratch files. Do this even on failure.

### 5. Report (250 words max, i-have-adhd shape)
First line: `TEST-AGENT VERDICT: pass` or `TEST-AGENT VERDICT: fail`.
Then the checks table with actual values. For any failure: the exact command, its
output, and your one-line read of the cause. No narration of the process.

## After the agent returns
Show the report to the user. With `--comment`, post it as a PR comment via
`gh pr comment <pr> --repo <owner>/<repo>`, verdict line first.
