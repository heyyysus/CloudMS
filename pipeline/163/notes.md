# Implementation notes — issue #163

## Implemented
- `listOrganizations()` (`backend/src/repositories/organizations.ts`) and
  `GET /organizations` (`requireSession` + `requirePlatformOwner`), returning
  `{ organizations: [{ id, name, slug }] }`.
- `isPlatformOwner` on the frontend `User` type, carried through `toMe`
  automatically since it's a plain field on the payload.
- `RequirePlatformOwner` guard (mirrors `RequireAuth`), mounted outside
  `RequireAuth`/`AppLayout` so a zero-membership owner isn't bounced to
  `/select-org`.
- `Platform.tsx`: lists every org, plus a create form (name, slug, admin
  email/name) via react-hook-form + zod, injectable `listOrganizationsFn`/
  `createOrganizationFn` props for stories.
- `/platform` route in `App.tsx`. No sidebar entry, per plan.
- Backend tests for `GET /organizations` (401/403×2/200); stories for
  `RequirePlatformOwner` (owner/non-owner/no-user/loading) and `Platform`
  (list, empty, load error, create success, duplicate-slug keeps the form).

## Decisions
- None beyond what the plan specified.

## Deviations
- Added a `GET /organizations` entry to `crossTenant.test.ts`'s `ENTRIES`
  table (exempt: lists every org by design, not scoped to one) — that test
  fails for any unlisted route, and the plan didn't call it out.

## For the docs stage / reviewer
- `docs/API.md` and `docs/multitenancy.md` (item 7, History) already updated
  here since the diff was small enough to do inline.

## Checks run
| area | command | result |
|---|---|---|
| backend | typecheck, lint, format:check, test (520), build | pass |
| frontend | lint, build, test (357, incl. new stories) | pass |
