# Cloud CMS

See [PROJECT.md](./PROJECT.md) for what this project is and where it's headed. This doc covers configuring and running it.

## Prerequisites

- Node.js 24
- Docker + Docker Compose (for Postgres/Redis locally, or to run the full stack)

## Option A: Run the backend locally, database in Docker

1. Start Postgres (and Redis) via Docker Compose:

   ```bash
   docker compose up -d db redis
   ```

   Postgres is exposed on host port `5433` (mapped to `5432` in the container), user `postgres`, password `password`, database `myapp`.

2. Configure the backend's environment:

   ```bash
   cd backend
   cp .env.example .env
   ```

   `.env` only needs `DATABASE_URL`, which already points at the Compose Postgres instance:

   ```
   DATABASE_URL=postgresql://postgres:password@localhost:5433/myapp
   ```

3. Install dependencies and run migrations:

   ```bash
   npm install
   npm run db:migrate
   npm run db:seed   # optional: seeds an example carrier, client, and policy
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
| `npm run db:generate` | Generate a new Drizzle migration from schema changes |
| `npm run db:studio` | Open Drizzle Studio against the configured `DATABASE_URL` |
| `npm run logs` | Print the last 100 lines of the app container's logs (`docker compose logs --tail 100 app`) |

## Option B: Run the full stack in Docker

This brings up nginx, the app, Postgres, Redis, and Certbot together — closer to the production setup.

1. Create a root-level `.env` (used by the `app` and `db` services; currently the Postgres credentials are hardcoded in `docker-compose.yml`, so an empty file is enough to get started).
2. Build and start everything:

   ```bash
   docker compose up --build -d
   ```

3. Requests go through nginx (`nginx/conf.d/default.conf`) to the app container on port 8000. With the default config, nginx listens on `http://localhost` (port 80).
4. Check logs / status:

   ```bash
   docker compose ps
   docker compose logs -f app
   ```

## Deployment

Merges to `main` that pass CI (typecheck, lint, format check, tests, build) automatically trigger `.github/workflows/ci.yml`'s `deploy` job, which SSHes into the deploy host and runs `scripts/start.sh` (`git pull` + `docker compose up --build -d`). Deploy credentials (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`) are configured as GitHub Actions secrets.

Frontend changes deploy separately: `.github/workflows/frontend.yml` triggers on pushes to `main` under `frontend/**`, builds the Vite app in CI (using the `VITE_GOOGLE_CLIENT_ID` secret), rsyncs `frontend/dist/` to `${DEPLOY_PATH}/frontend/dist` on the deploy host, and restarts the `nginx` container so it picks up the new static files — no image to rebuild, since the frontend isn't containerized. The same workflow runs lint + build (no deploy) on PRs touching `frontend/**`.
