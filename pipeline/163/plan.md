---
issue: 163
status: pending-review
---
# Platform-owner console for organizations

## Goal
A platform owner opens `/platform`, sees every organization, and creates one
with its first admin — no `curl`. An org `admin` who types `/platform` is
redirected to `/home`. Sidebar, org switcher and `/admin/*` are unchanged for
everyone. `npm test` and `npm run build` pass in `frontend/`.

## Scope check
Roadmap item 2, `docs/multitenancy.md` item 7 — the last piece before the demo
org. Triage labels are missing **`area:backend`**: `GET /organizations` does
not exist (#162 shipped only the POST), so listing needs a route. No schema, no
new middleware; `risk:medium` holds.

## Files / areas
| path | change |
|---|---|
| `backend/src/repositories/organizations.ts`, `index.ts` | `listOrganizations()` |
| `backend/src/routes/organizations.ts`, `.test.ts` | `GET /organizations` + tests |
| `frontend/src/api/auth.ts` | carry `isPlatformOwner` onto `User` |
| `frontend/src/api/organizations.ts` | new: list + create |
| `frontend/src/auth/RequirePlatformOwner.tsx`, `.stories.tsx` | new guard |
| `frontend/src/pages/Platform.tsx`, `.stories.tsx` | new page |
| `frontend/src/App.tsx` | `/platform` route |
| `docs/API.md`, `docs/multitenancy.md` | the new route; item 7 and History |

## Approach
1. `listOrganizations()` — select all, ordered by name; `organizations` is in
   `AUTH_LAYER_TABLES`, so plain `db` sees every row without `adminDb`.
2. `GET /organizations` — `requireSession` + `requirePlatformOwner`, the pair
   the POST already uses; returns `{ organizations: [{ id, name, slug }] }`.
3. `auth.ts`: add `isPlatformOwner` to `User` and keep it through `toMe`.
   Leave `AuthContextValue` otherwise alone, so `RequireRole`, the sidebar and
   the switcher have nothing new to widen on.
4. `RequirePlatformOwner` mirrors `RequireAuth`: spinner while loading, `!user`
   → `/login`, `!isPlatformOwner` → `/home`. It does not require `org`.
5. Mount `/platform` outside `RequireAuth`/`AppLayout` — an owner with zero
   memberships has an unbound session and would bounce to `/select-org`.
6. `Platform.tsx` — the list plus one create form (name, slug, admin email and
   name) on react-hook-form + zod, rendering the server's 409 text inline.
   Inject `listOrganizationsFn`/`createOrganizationFn` as props defaulting to
   the API module, the way `Home.tsx` takes `listClientsFn`; that is how the
   stories drive the fetch.

## Tests
Backend: extend `organizations.test.ts` using `ctx.platformOwner` — owner lists
all orgs, org admin gets 403, no session 401. Stories: owner sees the list; org
admin is redirected (assert the stand-in `/home` route renders); create
succeeds; duplicate slug shows the server error with the form still filled.
Run backend `npx vitest run`, frontend `npm test` and `npm run build`.

## Touches backend
Yes.

## Risks / open questions
- No sidebar entry, since the issue forbids widening it — `/platform` is
  URL-only. Should the user menu link it instead?

## Out of scope
Editing or deleting an org, seating a second admin, org settings, the demo org
(multitenancy item 8), any change to auth middleware or `RequireRole`.
