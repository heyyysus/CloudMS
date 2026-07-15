---
name: verify
description: Build, run, and drive CloudMS (backend Express + frontend Vite) to verify changes end-to-end.
---

# Verifying CloudMS

## Prerequisites
- Postgres runs via `docker compose` (container `cloudms-db-1`); backend `.env` points at it.
- Reset to known data: `cd backend && npm run db:seed` (wipes everything; seeds one admin user, one client "John Doe" with 1 policy, 2 vehicles, 3 drivers, carrier Progressive).

## Launch
- Backend: `cd backend && npm run dev` → Express on :8000 (routes unprefixed, e.g. `/policies`).
- Frontend: `cd frontend && npm run dev` → Vite on :5173, proxies `/api/v1/*` → :8000 (strips prefix).

## Auth
Login is Google-only; there is no password flow, so an authenticated session cannot be created without the user. **Stop and ask the user how to authenticate before driving authenticated surfaces.** (The backend tests' `src/routes/testHelpers.ts` shows how sessions work, for reference.) Re-seeding deletes all sessions.

## Drive
- API: curl `http://localhost:8000/<route>` with a `Cookie: session=…` header.
- UI: Playwright chromium is available via `frontend/node_modules/playwright-core` (import by absolute path `frontend/node_modules/playwright-core/index.mjs` if the script lives outside frontend/). Add the session cookie to the browser context, go to `http://localhost:5173/clients/<id>`.

## Gotchas
- ts-node scripts must live inside `backend/` or they fail with `imaginaryUncacheableRequireResolveScript`.
- Radix dialogs/popovers portal to body — query the page, not a container.
- `pkill` of the dev servers kills the calling shell's process group (exit 144); run kills in their own Bash call and re-check with `pgrep`.
