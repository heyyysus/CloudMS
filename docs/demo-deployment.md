# Demo Deployment

How to stand up a self-resetting demo instance of CloudMS, separate from
production, that visitors can poke at without anyone needing to babysit it.

## What demo mode is

Setting `DEMO_MODE=true` (see `backend/src/config.ts` and
`docs/AUTH_SESSIONS_EXPLAINED.md`) turns on:

- `POST /auth/demo` — no-Google sign-in that mints a fresh admin user
  (`isDemo: true`) and a session cookie, expiring after
  `DEMO_SESSION_TTL_MINUTES` (default 240) instead of the usual 7 days.
- `GET /config` reporting `{ demoMode: true }`, which the frontend uses to
  show a demo banner and hide features (e.g. real email sending) that don't
  make sense against a throwaway database.
- A per-table row ceiling (`DEMO_MAX_ROWS_PER_TABLE`, default 5000) so one
  visitor can't fill the database.
- **The periodic reseed job** described below.

## The reseed job

While `DEMO_MODE=true`, `backend/src/index.ts` starts an in-process job
(`backend/src/jobs/demoReseed.ts`) that wipes and reruns the normal seed data
generator (`backend/src/db/seed/run.ts`) every `DEMO_RESEED_INTERVAL_MINUTES`
(default 15). It also fires once immediately on boot if the database looks
empty, so a fresh container comes up with data instead of a blank screen for
a full interval.

**What survives a reseed:** any user row with `is_demo = true` and its
session — a visitor mid-click is not logged out from under themselves.

**What does not survive:** every client, carrier, policy, vehicle, invoice,
and everything else the seed generates. If a visitor has a client or policy
page open in another tab when a reseed runs, that id no longer exists and the
page 404s on its next request. Acceptable for a demo; there's no in-app
notice when this happens.

The job never overlaps itself and never takes the process down if a pass
fails — it logs the failure and tries again on the next tick. It refuses to
start at all when `NODE_ENV=test`, and it is only ever started from
`src/index.ts`, never from `app.ts` — the backend's supertest suites import
`app` directly, and a timer that truncates the database has no business
leaking into the test process.

> **The demo instance's `DATABASE_URL` must never point at the production
> database.** The reseed job deletes almost every row on a schedule. There is
> no interlock beyond the environment variable being set correctly — treat it
> with the same care as any other production credential.

## Bringing it up

**The demo runs on its own host.** It is a separate deployment, not a second
stack squeezed onto the production box: its own machine, its own hostname,
its own TLS cert, its own database. `docker-compose.demo.yml` at the repo
root defines it — own Postgres volume (`postgres_data_demo`), own database
(`myapp_demo`), own Compose project name (`cloudms-demo`). `scripts/start.sh`
(the production deploy script) never references this file.

On the demo host:

```bash
git clone https://github.com/heyyysus/CloudMS.git && cd CloudMS
cp .env.demo.example .env.demo   # fill in the real values
# Place the demo hostname's Cloudflare Origin CA cert + key here first:
#   nginx/certs/cloudflare-origin.pem
#   nginx/certs/cloudflare-origin.key
docker compose -f docker-compose.demo.yml up -d
```

You also need `frontend/dist/` built on that host (or rsynced to it) — nginx
serves the SPA from there, exactly as production does.

`.env.demo` deliberately has no `RESEND_API_KEY`, `MAIL_FROM`,
`MAIL_REPLY_TO`, or `R2_*` keys — the demo sends no real email and stores no
real attachments. `REMINDERS_ENABLED=false` is set for the same reason:
without a Resend key, every scheduled send would fail and burn through
`REMINDER_MAX_ATTEMPTS`.

`GOOGLE_CLIENT_ID` is still required even though the demo signs in via
`/auth/demo` — `src/index.ts` refuses to start without one regardless of demo
mode.

## HTTPS and ports

The demo serves HTTPS itself, the same way production does, and reuses
production's `nginx/conf.d/default.conf` verbatim — there is no separate demo
nginx config to keep in sync. `nginx` publishes 80 (redirects to HTTPS) and
443; `db` publishes `127.0.0.1:5433`, loopback only.

What differs is the certificate: issue a **second** Cloudflare Origin CA cert
for the demo hostname and place it at `nginx/certs/cloudflare-origin.pem` /
`.key` on the demo host. Do not copy production's cert over — it is issued
for the production hostname and would fail Cloudflare's `Full (strict)`
validation. `docs/cloudflare-https.md` covers issuing one; the process is
identical, just for the demo hostname.

Because the demo has its own host, it holds 80/443/5433 uncontested. Running
both stacks on one machine is not supported: they would collide on all three
ports, and colocating a database that gets wiped every 15 minutes with the
production one is exactly the accident this deployment is shaped to prevent.

## Not covered here

- Deploying the demo host automatically. `ci.yml` builds and deploys
  production only; nothing redeploys the demo when `main` changes. Pull the
  latest image and `docker compose -f docker-compose.demo.yml up -d` by hand.
- DNS/Cloudflare setup for a demo hostname.
- Backups. Neither database has any — the demo's disposability is the point,
  but production still has none either, which is a separate problem.
