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
- The moment both servers are up and the goal is *visual* verification (a human needs to look at the rendered app), stop driving the browser yourself — go straight to "Manual visual testing" below instead of automating it with Playwright.

## Auth
Login is Google-only; there is no password flow to script. Re-seeding deletes all sessions.

- **Non-visual driving** (curl against the API, Playwright against Storybook stories — those don't need auth at all) — mint a session yourself; see "Mint a session".
- **Visual testing of the live app in a real browser** — hand off to the user; see "Manual visual testing". Do not use a minted token to drive the live app's browser UI yourself.

### Mint a session
Write this to `backend/src/scripts/mint-session.ts` (ts-node scripts must live inside `backend/`, see Gotchas), then from `backend/` run `npx ts-node src/scripts/mint-session.ts [email]`. Omit the email to grab the first user row. Prints the raw token to stdout and nothing else. Mirrors `makeSessionCookie` in `src/routes/testHelpers.ts` — same primitives, runnable outside vitest.

```ts
import { generateSessionToken, hashToken } from "../auth/tokens"
import { createSession, findUserByEmail } from "../repositories"
import { db } from "../db"
import { users } from "../db/schema"

async function main() {
  const email = process.argv[2]
  const user = email ? await findUserByEmail(email) : (await db.select().from(users).limit(1))[0]
  if (!user) {
    console.error(email ? `No user with email ${email}` : "No users — run npm run db:seed first")
    process.exit(1)
  }
  const token = generateSessionToken()
  await createSession({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  console.log(token)
}

main()
```

### Manual visual testing
1. Mint a session token (above).
2. Tell the user to open `http://localhost:5173` in their browser, open devtools → console, and run:
   ```js
   document.cookie = "session=<token>; path=/"
   ```
   then reload the page. (The real login cookie is `httpOnly`, but nothing stops a fresh browser — one with no `session` cookie yet — from setting one under that name via JS; the server only reads the `Cookie` header on the request, it doesn't check how the cookie got there. The frontend calls `/auth/me` with `credentials: 'include'` on load, so a reload after setting the cookie is enough to authenticate.)
3. Stop and hand off — ask the user to check the change in the browser and report pass/fail. Do not drive this browser session yourself. If they report a failure, get what's wrong from them, fix it, and re-verify (rerun the automated checks; only loop back to this step if another visual pass is actually needed).

## Drive
- API: curl `http://localhost:8000/<route>` with a `Cookie: session=…` header (token from "Mint a session").
- Storybook / component-level interaction tests don't need auth — drive those directly with Playwright. Resolve `playwright-core`'s entry point rather than assuming a path — it's CJS (`index.js`, not `index.mjs`): run `node -e "console.log(require.resolve('playwright-core'))"` from `frontend/`, and import it into an ESM script via `createRequire`.

## Gotchas
- ts-node scripts must live inside `backend/` or they fail with `imaginaryUncacheableRequireResolveScript`.
- Radix dialogs/popovers portal to body — query the page, not a container.
- `pkill` of the dev servers kills the calling shell's process group (exit 144); run kills in their own Bash call and re-check with `pgrep`.
- Double-check commands actually run in `backend/`/`frontend/` inside the right worktree (`pwd` first) — `cd`-ing to an absolute path outside the current worktree silently verifies the wrong checkout.
