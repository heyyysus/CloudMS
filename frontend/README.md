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
(SPA client-side routing) and proxies API routes (e.g. `/auth`) through to
the `app` container, so the frontend and backend appear on the same origin
in production.

Because nginx just serves whatever is in `frontend/dist/`, docker-compose
works before the app exists — the site returns 404 until a build is
present.

## Auth

The backend already implements Google sign-in with cookie-backed sessions:

- `POST /auth/google` — exchange a Google ID token for a session cookie
- `GET /auth/me` — current session's user
- `POST /auth/logout` — clear the session

The SPA's login page (calling these endpoints) is the first UI milestone.

## Local development

```
npm run dev         # Vite dev server, proxies /auth to the API
npm run storybook   # component stories
```

## Status

This folder currently holds only this document and the docker-compose/nginx
wiring to serve it. Scaffolding the actual Vite app is a follow-up.
