# Demo mode

`DEMO_MODE=true` turns a CloudMS instance into a public, unauthenticated demo:
anyone can sign in as an admin with just a name, outbound mail/attachment
credentials are refused at boot, and a handful of guardrails keep one visitor
from filling or breaking the database for everyone else.

**Never set `DEMO_MODE=true` on the real instance.** `POST /auth/demo` mints a
fresh `admin` account for anyone who calls it, with no invitation and no
Google account required. A demo deployment must use its own database, never
the one behind production — see [Deploying a demo instance](#deploying-a-demo-instance)
below.

## What changes when `DEMO_MODE=true`

- `GET /config` reports `{ demoMode: true, demoResetMinutes?: number }`
  instead of `{ demoMode: false }`, so the frontend can show a demo banner and
  the demo sign-in form before any user is authenticated.
- `POST /auth/demo` (`backend/src/auth/demoRoutes.ts`) is mounted. It takes
  `{ name }`, creates a `users` row (`role: "admin"`, `isDemo: true`, a random
  `demo-<hex>@example.com` address) and mints a session cookie exactly like
  `/auth/google` does, except the expiry comes from `DEMO_SESSION_TTL_MINUTES`
  rather than the real 7-day `SESSION_TTL_MS`. With the flag off this route
  isn't mounted at all — it 404s. Calls are rate-limited; see
  [Rate limiting](#rate-limiting-post-authdemo) below. See also
  [`docs/AUTH_SESSIONS_EXPLAINED.md`](./AUTH_SESSIONS_EXPLAINED.md).
- The process refuses to start if `RESEND_API_KEY`, `MAIL_FROM`,
  `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, or
  `R2_BUCKET_NAME` is set (`backend/src/index.ts`) — a demo instance must not
  hold outbound credentials at all, even unused ones.
- `sendEmail()` (`backend/src/mailer.ts`) and R2's `getClient()`
  (`backend/src/storage/r2.ts`) both throw before checking whether they're
  configured, so every mail-sending and attachment route answers `403 {
  error: "Disabled in demo mode" }` instead of sending anything or 503ing.
- The reminder scheduler (`backend/src/jobs/scheduler.ts`) never starts.
- `demoRowCeiling` (`backend/src/middleware/demoRowCeiling.ts`) refuses new
  rows on 9 create routes once a table passes `DEMO_MAX_ROWS_PER_TABLE`, so
  one visitor can't grow the database without bound. It does not cover the
  `users` table — demo sign-ins accumulate until the database is reset.
- Demo users are excluded from `GET /users` (`visibleToAdmin()` in
  `backend/src/repositories/users.ts`) but are otherwise ordinary admin
  accounts.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `DEMO_MODE` | `false` | Master switch. Everything above is gated on this. |
| `DEMO_SESSION_TTL_MINUTES` | `240` | Session lifetime for demo sign-ins. Real (Google) sessions are unaffected. |
| `DEMO_MAX_ROWS_PER_TABLE` | `5000` | Per-table row ceiling on the 9 guarded create routes. |
| `DEMO_RESEED_INTERVAL_MINUTES` | `15` | How often the in-process reseed job wipes and reseeds the demo data. Also what `GET /config` reports for the frontend banner's "resets every N minutes" copy, so the two can't drift. A non-positive value falls back to the default. |
| `DEMO_SIGNIN_LIMIT_PER_HOUR` | `5` | Sign-ins per IP per rolling hour through `POST /auth/demo`, see below. |

## Resetting a demo host

The reset is automatic and runs in-process: while `DEMO_MODE=true`,
`backend/src/jobs/demoReseed.ts` wipes and reseeds the demo data every
`DEMO_RESEED_INTERVAL_MINUTES` (default 15), and once on boot if the database
is empty. Nothing external needs scheduling.

The wipe it runs is **demo-user-preserving**: rows in `users` with
`is_demo = true` and their sessions survive, so a visitor mid-click isn't
signed out by a reset. Everything else — clients, policies, invoices — is
regenerated, so ids a visitor had open stop existing and those pages 404 on
their next request. Bootstrap rows (the `ADMIN_EMAIL` admin, the automation
user, the `welcome` template) are recreated after every pass.

Do not run `npm run db:seed` against a demo host to force a reset: that is the
full-wipe path, which deletes demo users and their sessions too. It remains
the right command for local development.

The job refuses to start unless `demoMode()` is true, and never runs under
`NODE_ENV=test`. See [`docs/demo-deployment.md`](./demo-deployment.md) for the
deploy definition and its safety notes.

## Rate limiting `POST /auth/demo`

`backend/src/middleware/demoSignInLimit.ts` is a fixed-window counter, `DEMO_SIGNIN_LIMIT_PER_HOUR`
sign-ins per IP per rolling hour, mounted only on the demo router (itself only
mounted when `demoMode()`). Over the limit it answers `429 { error: ... }`.

This is a speed bump, not a security control:

- It's in-memory and per-container — state is lost on restart and not shared
  across containers.
- It keys on the left-most `X-Forwarded-For` entry rather than `req.ip`,
  because `app.ts` does not set `trust proxy` (turning that on globally would
  change request handling on the real production instance too, for the sake
  of a demo-only feature). That header is spoofable by anyone not behind the
  real proxy.

Don't rely on it to stop a determined actor from minting accounts — it exists
to keep casual abuse from being trivial, nothing more.

## Deploying a demo instance

The demo runs on its own host from `docker-compose.demo.yml`, with its own
database and volume. [`docs/demo-deployment.md`](./demo-deployment.md) is the
runbook; the demo-mode-specific points are:

1. Point it at a separate Postgres database — never the production
   `DATABASE_URL`. The reseed job's mass-delete on a timer makes a shared
   database unacceptable.
2. Run migrations (`npx tsx src/db/migrate.ts`). No initial seed is needed —
   the reseed job fills an empty database on boot.
3. Set `DEMO_MODE=true` and leave `RESEND_API_KEY`/`MAIL_FROM`/`R2_*` unset —
   the process refuses to start otherwise.
4. Set `GOOGLE_CLIENT_ID` regardless — it's required unconditionally
   (`backend/src/index.ts`), even though the demo sign-in path doesn't use
   it.
5. Optionally set `DEMO_RESEED_INTERVAL_MINUTES`; the banner follows it
   automatically, so there is nothing to keep in sync by hand.

Provisioning the host itself, DNS, and reverse-proxy/TLS configuration are
covered in [`docs/demo-deployment.md`](./demo-deployment.md).
