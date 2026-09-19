# Cloud CMS

See [PROJECT.md](./PROJECT.md) for what this project is and where it's headed. This doc covers configuring and running it.

## Prerequisites

- Node.js 24
- Docker + Docker Compose (for Postgres locally, or to run the full stack)

## Option A: Run the backend locally, database in Docker

1. Start Postgres via Docker Compose:

   ```bash
   docker compose up -d db
   ```

   Postgres is exposed on host port `5433` (mapped to `5432` in the container), user `postgres`, password `password`, database `myapp`.

2. Configure the backend's environment:

   ```bash
   cd backend
   cp .env.example .env
   ```

   `.env` needs `DATABASE_ADMIN_URL` and `DATABASE_URL`, which already point at the Compose Postgres instance:

   ```
   DATABASE_ADMIN_URL=postgresql://postgres:password@localhost:5433/myapp
   DATABASE_URL=postgresql://app:password@localhost:5433/myapp
   ```

   `DATABASE_ADMIN_URL` is the owner connection, used by `db:push`, `db:seed` and `db:bootstrap`. `DATABASE_URL` is the non-superuser `app` role that the API, the scheduler and the test suite run as; `db:push` creates it, so it won't exist until after step 3.

3. Install dependencies and push the schema:

   ```bash
   npm install
   npm run db:push       # applies schema.ts and creates/grants the app role, non-interactively
   npm run db:bootstrap  # inserts baseline rows (admin user, automation user, email templates)
   npm run db:seed       # optional: seeds an example carrier, client, and policy
   ```

4. Start the dev server (watches `src/` and restarts on change):

   ```bash
   npm run dev
   ```

   The API listens on `http://localhost:8000` (override with `PORT`). Check it's up:

   ```bash
   curl http://localhost:8000/health
   ```

### Other useful scripts (run from `backend/`)

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | TypeScript type checking, no emit |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Run the Vitest suite |
| `npm run build` | Compile to `dist/` |
| `npm run start` | Run the compiled build (`dist/index.js`) |
| `npm run db:push` | Apply `schema.ts` to the database non-interactively and create/grant the `app` role |
| `npm run db:bootstrap` | Insert baseline rows (admin user, automation user, email templates) |
| `npm run db:studio` | Open Drizzle Studio against the configured `DATABASE_ADMIN_URL` |
| `npm run logs` | Print the last 100 lines of the app container's logs (`docker compose logs --tail 100 app`) |

## Option B: Run the full stack in Docker

This brings up nginx, the app, and Postgres together — closer to the production setup.

1. Create a root-level `.env` (used by the `app` and `db` services; currently the Postgres credentials are hardcoded in `docker-compose.yml`, so an empty file is enough to get started).
2. Build and start everything:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
   ```

   `docker-compose.yml` on its own pulls the prebuilt `app` image from GHCR (that's what production does); the `docker-compose.build.yml` overlay replaces the pull with a local build from `backend/`.

3. Requests go through nginx (`nginx/conf.d/default.conf`) to the app container on port 8000. With the default config, nginx listens on `http://localhost` (port 80).
4. Check logs / status:

   ```bash
   docker compose ps
   docker compose logs -f app
   ```

## Before opening a PR

Run the same checks CI runs so a push doesn't fail in Actions. From `backend/`:

```bash
npm run typecheck
npm run lint
npm run format:check   # or `npm run format` to auto-fix
npm run db:push        # if the change touches schema.ts
npm test
npm run build
```

From `frontend/`:

```bash
npm run lint
npm run build
npm test               # runs the Storybook-based test suite
```

These mirror `.github/workflows/ci.yml` (backend) and `.github/workflows/frontend.yml` (frontend) step-for-step.

## Agent pipeline

Issues opened by a CODEOWNER and labelled `agent` are taken through an unattended
pipeline in GitHub Actions — planner, plan review, coder, docs, PR, PR review — with
merging the resulting PR as the only human gate. Each issue's artifacts (`plan.md`,
`review.md`, `notes.md`) are committed under `pipeline/<issue-number>/` on branch
`agent/issue-<n>`, so the diff carries the full paper trail. See
[pipeline/README.md](./pipeline/README.md) for the stage-by-stage breakdown, the label
glossary, how to resume a halted run, and cost tracking.

Before the pipeline can run on a repo (or a new fork), the labels it depends on need to
exist:

```bash
scripts/setup-pipeline-labels.sh          # defaults to the current repo
scripts/setup-pipeline-labels.sh owner/repo
```

This creates or updates the `agent`, `pipeline:*`, `needs-human`, `agent:deep-review` and
`area:*` labels the workflows key off, using `gh label create --force`, so it's safe to
re-run. It requires the GitHub CLI authenticated with label-write access, and only needs
to be run once per repo — the workflows won't chain correctly until the labels exist.

The pipeline also needs two GitHub Actions secrets, `CLAUDE_CODE_OAUTH_TOKEN` and
`PIPELINE_BOT_TOKEN`; see `pipeline/README.md`'s "Setup (once)" section for what each is
for and how to obtain them.

## Deployment

Merges to `main` that pass CI (typecheck, lint, format check, tests, build) trigger `.github/workflows/ci.yml`'s `image` job, which builds `backend/Dockerfile` on the runner and pushes it to `ghcr.io/heyyysus/cloudms-app` tagged `latest` and with the commit SHA. The `deploy` job then SSHes into the deploy host and runs `scripts/start.sh` (`git pull` + `docker compose pull app` + `docker compose up -d`) — nothing is built on the host. Deploy credentials (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`) are configured as GitHub Actions secrets; pushing to GHCR uses the per-run `GITHUB_TOKEN`, and the package is public so the host pulls without credentials.

To roll back, edit the `app` image on the host to a known-good SHA tag (`ghcr.io/heyyysus/cloudms-app:<sha>`) and run `docker compose up -d app`.

Frontend changes deploy separately: `.github/workflows/frontend.yml` triggers on pushes to `main` under `frontend/**`, builds the Vite app in CI (using the `VITE_GOOGLE_CLIENT_ID` secret), rsyncs `frontend/dist/` to `${DEPLOY_PATH}/frontend/dist` on the deploy host, and restarts the `nginx` container so it picks up the new static files — no image to rebuild, since the frontend isn't containerized. The same workflow runs lint + build (no deploy) on PRs touching `frontend/**`.

### One deployment, many agencies

This stack is the whole product: every agency that signs up will be an organization inside it, sharing the one API, the one Postgres, and the one nginx. There is no per-agency instance, host, or compose file to bring up, and none is planned. The organization model, its rollout order, and the in-deployment demo org are laid out in [`docs/multitenancy.md`](docs/multitenancy.md).
