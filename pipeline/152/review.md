# Plan review — issue #152

## Findings

- Scope matches the issue exactly: hydrate `listClients`, wire the debounced list into `/home`, remove the two stub cards, no schema/auth change. Confirmed `backend/src/repositories/clients.ts:7-9` is the bare `select()` the plan says it is, and `routes/clients.ts:29` is the sole caller — no route-handler change needed.
- The hydration approach copies a real, working pattern: `searchClients` in `repositories/search.ts:82-94` already does the two-step join-then-`findMany`-then-remap the plan prescribes, and `getClientWithDetails` (`clients.ts:19-29`) already has the per-relation `eq(<table>.orgId, orgId)` filters the plan says to copy verbatim. Cross-org isolation is addressed directly, not hand-waved.
- Frontend reuse checks out: `search-palette.tsx:33` is the `searchFn = defaultSearch` injection seam, `:35-48` is the debounce/query block, `:102-105` is the row-rendering block the plan says to mirror — all three line ranges are accurate. `useDebouncedValue` (`hooks/use-debounced-value.ts`) and `clientDisplayName`/`formatClientId` (`api/clients.ts`) exist as described.
- Test plan uses `TestContext` correctly: `ctx.person`, `ctx.client`, `ctx.clientEmail`, `ctx.org` all exist in `testHelpers.ts`, and the plan explicitly avoids absolute indexes/global counts per CLAUDE.md.
- The docs-stage claim is correct and worth landing: `.github/workflows/frontend.yml:31-35` does install Chromium and run `npm test` between lint and build, so `PROJECT.md:59`'s "isn't wired into CI yet" is stale.
- `Home.tsx` is genuinely 122 lines today and the `openTab`/`navigate` two-liner is genuinely at `:113-114`, so the plan's extraction rationale and reuse pointer both hold.

## Required changes (if rejected)

N/A

Verdict: approved
