---
issue: 152
status: pending-review
---
# Home dashboard: a real client list with search

## Goal

`/home` lists the org's clients by name and filters them as you type, instead of showing three "coming soon" cards.

Done when:

1. `GET /clients` returns hydrated rows (`namedInsured`, `secondNamedInsured`, `phones`, `emails`), ordered by last name then first name.
2. `/home` renders that list with loading, empty ("No clients yet") and error states; a debounced input filters through `GET /clients?q=`; clearing the input restores the full list.
3. A row click calls `useClientTabs().openTab` and navigates to `/clients/:id`.
4. The rater-file drop target and its `useFileDrop` wiring are untouched.
5. `cd backend && npx vitest run src/routes/clients.test.ts`, `cd frontend && npm test`, and `cd frontend && npm run build` all pass.
6. A client in another org appears in neither branch, covered by a route test.

## Scope check

Closes the remaining half of PROJECT.md *Direction* item 1 ("Turn the Home dashboard into a real landing page — a client list and search — and wire the frontend test suite into CI"). The CI half already shipped: `.github/workflows/frontend.yml:34-35` installs Chromium and runs `npm test` between lint and build.

Triage labels look right. `risk:medium` fits — the one real risk is the cross-org leak called out below, not the UI.

`area:frontend` alone undersells it: this touches `backend/src/repositories/clients.ts` too, so **Touches backend: yes**.

## Files / areas

| Path | Change |
| --- | --- |
| `backend/src/repositories/clients.ts` | Hydrate + order `listClients` (`:7-9`) |
| `backend/src/routes/clients.test.ts` | Shape, ordering, cross-org assertions |
| `frontend/src/api/clients.ts` | `ClientListItem` type + `listClients(q?, signal?)` |
| `frontend/src/api/search.ts` | Re-point `SearchClientResult` at `ClientListItem` |
| `frontend/src/components/clients/client-list.tsx` | New — the list UI |
| `frontend/src/pages/Home.tsx` | Search input + list, stub cards removed |
| `frontend/src/pages/Home.stories.tsx` | New — the frontend test |
| `PROJECT.md` | Docs stage only, see below |

No schema change, no auth change, no route-handler change — `clients.ts:29` already calls `listClients(req.orgId!)` and is the only caller.

## Approach

### 1. Hydrate `listClients` (~30 min)

Drizzle's relational `findMany` can only `orderBy` columns on `clients`, and the sort keys live on `persons`. Use the same two-step `searchClients` uses (`repositories/search.ts:82-94`):

```ts
const matches = await db
  .select({ id: clients.id })
  .from(clients)
  .innerJoin(persons, and(eq(clients.namedInsuredId, persons.id), eq(persons.orgId, orgId)))
  .where(eq(clients.orgId, orgId))
  .orderBy(asc(persons.lastName), asc(persons.firstName))
```

then `db.query.clients.findMany({ where: and(inArray(clients.id, ids), eq(clients.orgId, orgId)), with: {...} })`, then re-map through `new Map(rows.map(r => [r.id, r]))` in `ids` order — `findMany` does not preserve the `inArray` order.

Copy the `with:` block from `getClientWithDetails` (`:22-28`) **verbatim**, minus `policies`: every relation keeps its own `eq(<table>.orgId, orgId)`. A hydrated relation missing that filter is the cross-org leak the #119 review caught. Return `namedInsured`, `secondNamedInsured`, `phones`, `emails` — the exact shape `searchClients` returns, so both branches of `GET /clients` satisfy one type.

Drop the `Promise<Client[]>` annotation and let the inferred type flow; `Client` no longer describes the row.

### 2. Backend tests (~20 min)

Extend `backend/src/routes/clients.test.ts` (existing `GET /clients` block, `:14-22`). Use `TestContext` — `ctx.person({ lastName })`, `ctx.client({ namedInsuredId })`, `ctx.clientEmail(clientId)`.

- **Shape:** one client with an email; assert `namedInsured.firstName`, `emails[0].email`, `phones` present, and `secondNamedInsured === null`.
- **Ordering:** two clients in the ctx org with last names `Aaa-<unique>` and `Zzz-<unique>`. Filter the response to those two ids and assert their *relative* index order. Never assert absolute indexes or `res.body.length` — other agents' rows share the database (CLAUDE.md, *Concurrent agents*).
- **Cross-org:** the existing test at `:47-67` already asserts the bare branch excludes another org's client. Add the same assertion for `GET /clients?q=<that client's last name>`.

### 3. Frontend API (~15 min)

In `frontend/src/api/clients.ts`:

```ts
export type ClientListItem = Omit<ClientDetail, 'policies'>

export function listClients(q?: string, signal?: AbortSignal): Promise<ClientListItem[]> {
  const query = q ? `?q=${encodeURIComponent(q)}` : ''
  return request(`/clients${query}`, { signal })
}

export type ListClientsFn = typeof listClients
```

`api/search.ts:4` already declares `Omit<ClientDetail, 'policies'>` under the name `SearchClientResult`. Re-export it from `ClientListItem` (`export type SearchClientResult = ClientListItem`) so the two can't drift.

### 4. `client-list.tsx` + `Home.tsx` (~45 min)

`Home.tsx` is already 122 lines, so extract from the start rather than waiting for ~200.

`components/clients/client-list.tsx` owns the input, the query and the states, and takes `listClientsFn?: ListClientsFn` defaulting to the real one — the injection seam `SearchPalette` uses (`search-palette.tsx:33`), which is what makes the story testable. It also takes `onSelectClient: (client: ClientListItem) => void`.

Inside, mirror `search-palette.tsx:35-48`:

- `useDebouncedValue(input, 250)` from `@/hooks/use-debounced-value`
- `useQuery({ queryKey: ['clients', q], queryFn: ({ signal }) => listClientsFn(q || undefined, signal), placeholderData: keepPreviousData })` — no `enabled` guard, because the empty query is the full list
- render `formatNameLastFirst(client.namedInsured)` (`@/lib/person-name`) with `client.emails[0]?.email ?? formatPhone(client.phones[0]?.phoneNumber)` underneath, same as `search-palette.tsx:102-105`
- states: `isPending` → "Loading clients…", `isError` → "Couldn't load clients.", empty + no query → "No clients yet", empty + query → `No clients match "{q}".`

Rows are `<button>` elements so `getByRole('button', { name })` works in the story and keyboard access comes free.

In `Home.tsx`: delete the `sections` array and its three stub cards (the issue permits removing them once the list makes them redundant), keep the Import card, keep `useFileDrop`/`dragHandlers`/`ImportQuoteDialog` byte-for-byte. Render `<ClientList onSelectClient={...} />`, whose handler is the same two lines the import path already runs (`Home.tsx:113-114`):

```ts
openTab({ id: client.id, label: clientDisplayName(client) })
navigate(`/clients/${client.id}`)
```

Thread `listClientsFn` through `Home` as an optional prop so the story can inject it; `App.tsx:36` renders `<Home />` with no props, so the default keeps that working.

### 5. `Home.stories.tsx` (~30 min)

New file, pattern from `SelectOrg.stories.tsx:35-56`. Decorator: `QueryClientProvider` (retry: false) → `MemoryRouter initialEntries={['/home']}` → `ClientTabsProvider` → `Routes` with `/home` = `<Story />` and `/clients/:clientId` = `<p>client page</p>`, so navigation is observable as text.

`listClientsFn` is an `fn(async (q) => ...)` over a two-client fixture that filters on `q` itself — that is what proves the input round-trips to the API rather than filtering client-side.

Stories: `Default` (both clients render), `TypingFilters` (type, `findByText` the match, `queryByText` the other is gone), `ClearingRestores` (`userEvent.clear`, both back), `EmptyState` (`listClientsFn` returns `[]`, "No clients yet"), `OpensClientTab` (click a row, `findByText('client page')`).

`userEvent.type` plus the 250 ms debounce means assertions must be `findBy*`, not `getBy*`.

## Tests

- `cd backend && npx vitest run src/routes/clients.test.ts` — hydration, ordering, cross-org.
- `cd backend && npx vitest run` — the commit hook runs it anyway; `listClients`' changed return type could surface elsewhere at type-check time.
- `cd frontend && npm test` — Storybook stories in real Chromium via Vitest browser mode.
- `cd frontend && npm run build` — `tsc -b` catches the `SearchClientResult` re-point.
- `cd frontend && npm run lint`.

## Touches backend

yes

## Risks / open questions

1. **Cross-org leak in the hydrated relations.** The whole risk of this issue. Every `with:` relation needs its own `eq(<table>.orgId, orgId)`; RLS is the backstop, not the guard. Copy from `getClientWithDetails:22-28` rather than retyping.
2. **Unpaged list.** `GET /clients` returns the whole org. Deliberate, per *Out of scope* — an org with thousands of clients gets a slow first paint, and search is the answer.
3. **Cost of hydration.** The list goes from one flat `select` to a join plus a relational load. Acceptable at current org sizes; revisit with pagination.
4. **`secondNamedInsured` in the display name.** `clientDisplayName` only reads `namedInsured`. Leaving it that way keeps the tab label consistent with every other call site.
5. **Open question:** should the ordering test seed its own persons with fixed last names (assumed yes — `ctx.person()` defaults to `lastName: "Test"` with a random first name, which cannot prove a two-key sort)?

## Out of scope

- **Pagination** — the list stays unpaged.
- `GET /search`, the ⌘K palette, and building out the Policies/Activity cards. The two stub cards get deleted, not rebuilt.
- Schema changes, auth changes, and anything under `.github/`.
- **For the docs stage, not this one:** `PROJECT.md:59` claims the frontend test suite isn't in CI. That is false on `main` — `.github/workflows/frontend.yml:34-35` installs Chromium and runs `npm test`. Fix that sentence and reduce *Direction* item 1 to the dashboard half. Docs edit only.

## Next action

Read `backend/src/repositories/search.ts:82-94`, then rewrite `listClients` in `backend/src/repositories/clients.ts:7-9` to that two-step shape.
