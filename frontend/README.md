# Frontend

The CloudMS frontend is a **Vite SPA** (React + TypeScript), built to static
assets and served by the existing nginx container — no dedicated frontend
container or Node runtime in production.

## Stack

- **Vite** — dev server and build tool.
- **React + TypeScript** — app code.
- **Storybook** — component stories and testing in isolation.

## How it's served

`npm run build` outputs static assets to `frontend/dist/`. docker-compose
mounts that directory read-only into the `nginx` service at
`/usr/share/nginx/html`. nginx serves `index.html` for any non-file route
under `/` (SPA client-side routing) and proxies everything under `/api/v1`
to the `app` container, so the frontend and backend appear on the same
origin in production.

Backend routes are still mounted at root today (e.g. `/auth/google`), not
under `/api/v1` — nginx strips the `/api/v1` prefix before proxying, so the
edge contract (`/api/v1/...`) is stable while that backend migration is
still pending. Once the app itself mounts routes under `/api/v1`, that
stripping goes away (see the comment in `nginx/conf.d/default.conf`).

Because nginx just serves whatever is in `frontend/dist/`, docker-compose
works before the app exists — until a build is present, `/` returns a bare
403 (nginx serving an index-less static directory), not 404.

## Auth

The backend already implements Google sign-in with cookie-backed sessions,
reachable through the edge at `/api/v1/auth/*`:

- `POST /api/v1/auth/google` — exchange a Google ID token for a session cookie
- `GET /api/v1/auth/me` — current session's user
- `POST /api/v1/auth/logout` — clear the session

The SPA implements `/login` (Google Sign-In button) and `/logout`. Auth
state is provided by `AuthProvider` (`src/auth/AuthContext.tsx`), which
calls `GET /auth/me` on load; the typed API client lives in `src/api/`.

## Environment

Copy `.env.example` to `.env` and set `VITE_GOOGLE_CLIENT_ID` to the same
value as the backend's `GOOGLE_CLIENT_ID`. For local development, add
`http://localhost:5173` and `http://localhost` to the OAuth client's
Authorized JavaScript origins in the Google Cloud Console.

## Local development

```
npm run dev         # Vite dev server, proxies /api/v1 to the API
npm run storybook   # component stories
```

## Status

The Vite + React/TS app is scaffolded with Storybook and basic Google
Sign-In auth (`/login`, `/logout`). No other resource pages exist yet.
