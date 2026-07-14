# Frontend Auth: Google Sign-In (/login, /logout) + API client

## Context

The frontend is a bare Vite 8 + React 19 + TS scaffold (default template, no router, no API code). The backend already implements invite-only Google auth (`backend/src/auth/`): `POST /auth/google` exchanges a Google ID token for an httpOnly `session` cookie and returns `{ user }`; `GET /auth/me` returns the current user; `POST /auth/logout` clears the session. nginx exposes these to the browser as `/api/v1/auth/*` (prefix stripped), same origin as the SPA — so cookies work with no CORS. This task builds the typed frontend API layer plus `/login` and `/logout` pages styled like the default Vite template.

Backend response shape (from `backend/src/auth/routes.ts`):
`PublicUser = { id: number; email: string; name: string | null; role: "admin" | "staff" }`
Errors: `400 {error:"idToken is required"}`, `401 {error:"Invalid Google token"}`, `403 {error:"Account not authorized"}`.

## What the user must provide (prerequisites)

1. **`frontend/.env`** with `VITE_GOOGLE_CLIENT_ID=<same value as GOOGLE_CLIENT_ID in backend/.env>`. Already gitignored by the root `.gitignore` (`.env` matches at any depth). A committed `frontend/.env.example` documents it.
2. **Google Cloud Console** → OAuth client → Authorized JavaScript origins: add `http://localhost:5173` and `http://localhost` for local dev (production origin presumably already set).
3. A user row must exist for the tester (invite-only): set `ADMIN_EMAIL` in `backend/.env` so the migrate/startup bootstrap creates it.

## Git steps

- Branch `feature/frontend-auth` created from `origin/main` (post PR #5 merge, commit `1b6e71f`).
- Per standing rule: no commits or pushes without explicit approval — work stays uncommitted until the user says otherwise.

## Installs (in `frontend/`)

```
npm install react-router
npm install -D @types/google.accounts
```
(react-router v7 single package — not `react-router-dom`. GIS loaded via script tag, no `@react-oauth/google` dep.)

## New files (under `frontend/src/`)

- **`api/client.ts`** — `const BASE = "/api/v1"`; `class ApiError extends Error { status: number }`; `request<T>(path, init?)` fetch wrapper: JSON headers, `credentials: "include"`, on `!res.ok` throws `ApiError(status, body.error ?? statusText)`. Future API modules build on this.
- **`api/auth.ts`** — `interface User` (mirrors `PublicUser`); `loginWithGoogle(idToken): Promise<User>` → `POST /auth/google`; `getMe(): Promise<User>` → `GET /auth/me`; `logout(): Promise<void>` → `POST /auth/logout`.
- **`auth/AuthContext.tsx`** — `AuthProvider` + `useAuth()`. Value: `{ user: User | null, loading: boolean, setUser }`. On mount calls `getMe()`; any failure resolves to `user = null` (never blocks the app).
- **`auth/useGoogleSignIn.ts`** — hook `useGoogleSignIn(onCredential)` → `{ buttonRef, error }`. Idempotently injects the GIS script (`https://accounts.google.com/gsi/client`), then `google.accounts.id.initialize({ client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID, callback: r => onCredential(r.credential) })` + `renderButton(buttonRef.current, { theme: "outline", size: "large" })`. Surfaces an error if the script fails or the env var is missing. Must survive StrictMode double-mount.
- **`vite-env.d.ts`** (in `src/`, doesn't exist yet) — `interface ImportMetaEnv { readonly VITE_GOOGLE_CLIENT_ID: string }` augmentation.
- **`pages/Home.tsx`** — current `App.tsx` JSX moves here mostly as-is; add a small auth strip in `#center`: signed in → "Signed in as {name ?? email} ({role})" + `Link to="/logout"`; signed out → `Link to="/login"`. `/` stays public.
- **`pages/Login.tsx`** — if `loading`, minimal placeholder; if `user`, `<Navigate to="/" replace />`. Centered template-styled column: `<h1>Sign in</h1>`, GIS button div. On credential: `loginWithGoogle` → `setUser` → `navigate("/", { replace: true })`. Error messages: 403 → "account not authorized / ask an admin", 401 → "couldn't verify, try again", other → generic failure.
- **`pages/Logout.tsx`** — on mount (ref-guarded): `logout()` (ignore errors), `setUser(null)`, `navigate("/login", { replace: true })`. Renders "Signing out…".
- **`frontend/.env.example`** — documents `VITE_GOOGLE_CLIENT_ID`.

## Edits to existing files

- **`src/App.tsx`** — becomes the router shell: `BrowserRouter > AuthProvider > Routes` for `/`, `/login`, `/logout`, `*` → `Navigate to "/"`. Keeps `import './App.css'`. (`main.tsx` unchanged.)
- **`src/App.css`** — append `.auth-page` (clone of `#center` layout), `.auth-error`, `.auth-strip` using the existing CSS variables (`--text`, `--accent`, `--accent-bg`, `--accent-border`) so pages match the template in light and dark mode.
- **`vite.config.ts`** — add dev proxy mirroring nginx:
  ```ts
  server: { proxy: { '/api/v1': { target: 'http://localhost:8000', changeOrigin: true, rewrite: p => p.replace(/^\/api\/v1/, '') } } }
  ```
  (README already claims this proxy exists; this makes it true.)
- **`tsconfig.app.json`** — `"types": ["vite/client"]` → `["vite/client", "google.accounts"]`.
- **`frontend/README.md`** — short Environment section: `frontend/.env` + `VITE_GOOGLE_CLIENT_ID`, Google Console localhost-origins note.

## Out of scope

- Storybook stories (the GIS button is an external iframe — a story would be hollow; existing example stories untouched so `build-storybook`/vitest keep passing).
- Route guards on `/` (backend enforces auth on data; only auth pages exist for now).
- Any non-auth resource endpoints (none exist on the backend yet).

## Verification

1. `cd frontend && npm run lint && npm run build` (build runs `tsc -b`).
2. Backend running on 8000 with `GOOGLE_CLIENT_ID` + `ADMIN_EMAIL` set (bootstrap creates the invited admin row).
3. `npm run dev` → open `http://localhost:5173/login`; sign in with the invited Google account → redirected to `/`, auth strip shows name/email/role; `session` cookie visible in DevTools; page refresh stays authed (proves `getMe` bootstrap).
4. `/logout` → lands on `/login`, cookie cleared; visiting `/login` while authed redirects to `/`.
5. Negative path: non-invited Google account → 403 message rendered, no cookie.

## Gotchas noted

- StrictMode double-mount: GIS injection idempotent; Logout effect ref-guarded; double `getMe` is a harmless GET.
- `erasableSyntaxOnly` is on in tsconfig — no enums/parameter properties in new code.
- GIS may log FedCM notices on localhost; the ID-token callback flow is unaffected.
