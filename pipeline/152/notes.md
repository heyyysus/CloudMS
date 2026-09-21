---
issue: 152
status: implemented
---
# Implementation notes — issue #152

## Implemented

1. `backend/src/repositories/clients.ts`: `listClients` now joins to `persons`
   for ordering, then hydrates via the same join-then-`findMany`-then-remap
   shape `searchClients` uses. Returns `namedInsured`, `secondNamedInsured`,
   `phones`, `emails`, ordered by last name then first name. Each relation
   keeps its own `orgId` filter, copied from `getClientWithDetails`.
2. `backend/src/routes/clients.test.ts`: added a shape test (hydrated fields
   present), an ordering test (two persons with unique `Aaa-`/`Zzz-` last
   names, asserting relative index order — no absolute indexes or length
   checks per CLAUDE.md), and a cross-org assertion on `GET /clients?q=`
   alongside the existing bare-branch one.
3. `frontend/src/api/clients.ts`: added `ClientListItem` and `listClients(q?,
   signal?)`.
4. `frontend/src/api/search.ts`: `SearchClientResult` now re-exports
   `ClientListItem` so the two types can't drift.
5. `frontend/src/components/clients/client-list.tsx` (new): owns the search
   input, debounce, query, and loading/empty/error states. Takes
   `listClientsFn` for test injection, mirrors `search-palette.tsx`'s pattern.
6. `frontend/src/pages/Home.tsx`: removed the three stub cards, added
   `<ClientList>`. Import-card markup and `useFileDrop`/drag handlers are
   untouched. `handleSelectClient` runs the same `openTab` + `navigate` two
   lines the import path already used.
7. `frontend/src/pages/Home.stories.tsx` (new): `Default`, `TypingFilters`,
   `ClearingRestores`, `EmptyState`, `OpensClientTab`.

## Decisions

- Kept `Client` type import in `clients.ts` — still used by
  `findClientById`/`createClient`/`updateClient`.
- `listClients`'s return type is inferred (not annotated `Client[]`), per the
  plan — the row shape now includes hydrated relations.

## Deviations from plan

None. Implemented as scoped.

## For the docs stage / reviewer

- `PROJECT.md:59`'s claim that the frontend test suite isn't wired into CI is
  stale (`.github/workflows/frontend.yml:34-35` already runs it) — plan marks
  this as a docs-stage fix, not done here.
- Pagination, `GET /search`/⌘K palette, and Policies/Activity cards are out of
  scope per the plan; not touched.

## Checks run

- `cd backend && npx vitest run src/routes/clients.test.ts` — pass (19 tests)
- `cd backend && npm run typecheck` — pass
- `cd backend && npm run lint` — pass
- `cd backend && npm run format:check` — pass
- `cd backend && npm test` — pass (478 tests, 37 files)
- `cd backend && npm run build` — pass
- `cd frontend && npm run lint` — pass (only pre-existing warnings)
- `cd frontend && npm test` — pass (346 tests, 61 files; installed Chromium
  headless shell via `npx playwright install chromium` first, since it wasn't
  present on this runner)
- `cd frontend && npm run build` — pass

## Docs

Updated `docs/API.md`: plain `GET /clients` used to return bare Client rows;
it now returns the same detail-minus-`policies` shape as `GET /clients?q=`
(ordered by last name/first name, not filtered). Fixed the bare-Client
description, the "search is a different shape" paragraph, the `/clients`
table row, and the example-response caption to match.
