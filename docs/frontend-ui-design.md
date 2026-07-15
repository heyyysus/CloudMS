# Frontend UI Design

Design system foundation for the CloudMS frontend: Tailwind CSS v4 + shadcn/ui, an authenticated app shell, and Storybook wiring. This document explains the decisions and conventions so future feature work builds on them consistently.

## Stack

- **Tailwind CSS v4** via the first-party `@tailwindcss/vite` plugin. No `tailwind.config.js` — v4 is CSS-first; all theme configuration lives in `src/index.css`.
- **shadcn/ui** — components are copied into `src/components/ui/` as owned source (via `npx shadcn@latest add <name>`), not installed as a runtime package. Edit them directly when a component needs to diverge from the registry default. Registry preset: `radix-nova` (neutral base color), Radix behavior primitives via the unified `radix-ui` package, icons via `lucide-react`.
- **react-hook-form + zod** for form state and validation, paired with shadcn's `Field` primitive (`src/components/ui/field.tsx`) rather than the older Context-driven `Form`/`FormField` API — the registry replaced that pattern with `Field`/`FieldLabel`/`FieldError`/`FieldGroup`, which works with any form library (or none) and needs no provider wrapper. See `src/components/examples/demo-form.tsx` for the canonical pattern.
- **TanStack Query** handles server state — `src/lib/query-client.ts`'s `createQueryClient()` factory (5min `staleTime`, 30min `gcTime`, no refetch-on-window-focus, no retry on 4xx `ApiError`s, capped at 2 retries otherwise). Wired once at the app root. **TanStack Table** remains intentionally deferred — add it only when a feature first needs a real data table.

## Token architecture

All design tokens live in `src/index.css`:
- `:root` / `.dark` define raw color variables (`--background`, `--foreground`, `--primary`, `--sidebar-*`, etc.), mostly OKLCH from the shadcn neutral preset, with `--primary`/`--ring`/`--sidebar-primary`/`--sidebar-ring` overridden to the CloudMS purple accent (`#aa3bff` light / `#c084fc` dark — carried over from the original hand-rolled token set).
- `@theme inline` maps those raw variables to Tailwind's color/radius/font scale (`--color-primary: var(--primary)`, etc.) so utilities like `bg-primary` work.
- Fonts use the system stack (`system-ui, 'Segoe UI', Roboto, sans-serif` / `ui-monospace, Consolas, monospace`) rather than shadcn's default Geist Variable font, to avoid an extra font package.

To add a new token: add the raw variable to both `:root` and `.dark`, then map it in `@theme inline` if it needs a Tailwind utility.

## Dark mode

Dark mode is a manually-toggled `.dark` class on `<html>`, not `prefers-color-scheme` media queries — `color-scheme: light` / `color-scheme: dark` are set per-class so native form controls and scrollbars match the toggle.

- `src/components/theme-provider.tsx` — `ThemeProvider`/`useTheme()`. Theme is `'light' | 'dark' | 'system'`, persisted to `localStorage` under `cloudms-theme`. `'system'` resolves via `matchMedia('(prefers-color-scheme: dark)')` and subscribes to changes.
- `src/components/theme-toggle.tsx` — the dropdown toggle, used in the app header.
- Wrapped once at the root in `src/main.tsx`, outside the router.

## Routing & layout

- `src/auth/RequireAuth.tsx` — auth gate. Renders a centered loader while `AuthContext`'s `loading` is true (avoids a flash of the wrong route), redirects to `/login` if unauthenticated, otherwise renders `<Outlet />`.
- `src/components/layout/app-layout.tsx` — the shell: shadcn `Sidebar` (`collapsible="icon"`) + header (sidebar trigger, theme toggle, user menu) + `<main>` outlet. Reads `useAuth()` once and passes `user` down as a prop, rather than each child reading context directly — keeps `UserMenu` renderable in Storybook without an `AuthProvider`/network call.
- Route tree (`src/App.tsx`): `/login`, `/logout` are standalone; `/home` sits under `RequireAuth` → `AppLayout`; `/` and unknown paths redirect to `/home` (which itself redirects to `/login` if unauthenticated).
- `src/components/layout/app-sidebar.tsx` / `user-menu.tsx` — sidebar nav and the header's account menu. New nav items go in `app-sidebar.tsx`'s `platformItems` list (or a new `SidebarGroup` for a new section).

## Conventions

- **`@/` import alias** maps to `src/` (configured in `tsconfig.json`, `tsconfig.app.json`, and `vite.config.ts`). Use it for anything outside the current directory.
- **Props over context in shared components** — components meant to be used in Storybook (layout pieces, menus) should take data as props rather than reading `AuthContext`/making network calls directly, so they render standalone in stories.
- **Form pattern** — see `src/components/examples/demo-form.tsx`: `useForm` + `zodResolver`, shadcn `Field`/`FieldLabel`/`FieldError`/`FieldGroup`, native `register()` (no `Controller` needed for plain inputs). Copy this pattern for new CRUD forms rather than reinventing form scaffolding. For a dynamic list of rows (phones, emails, line items), use `useFieldArray` — it requires each row to be an object (`{ value: string }`), not a bare primitive, so wrap/unwrap on the way in and out of the form; see `src/components/clients/edit-client-dialog.tsx`.
- **Server mutations & CRUD dialogs** — the canonical shape (established by `src/components/clients/edit-client-dialog.tsx`) is a container/presentational split: a container component owns the open state and the `useMutation` call, and renders a presentational form that takes `onSubmit`/`isPending`/`errorMessage` (and `onCancel`, since the form must not reach for `DialogClose` — that requires Radix `Dialog` context the standalone form doesn't have in Storybook) as plain props. The container injects its API call via an optional `xxxFn?: typeof realFn` prop defaulting to the real function, the same way `SearchPalette` takes `searchFn` — this lets stories pass `fn()` mocks with no network/MSW setup. On success, prefer `queryClient.setQueryData(key, response)` over `invalidateQueries` when the mutation's response is already the full detail object the page reads (skips a refetch flash); fall back to `invalidateQueries` otherwise. The dialog itself composes into its host via an `action?: ReactNode` slot on the host component rather than the host importing and owning the dialog's internals.
- **Storybook**: every story must render standalone in the Playwright/Chromium test run (`addon-vitest` treats stories as tests). Router-dependent components need a `MemoryRouter` decorator; nothing in a story may call `getMe()` or otherwise depend on `AuthProvider`. Components that use `useQuery`/`useMutation` need a `QueryClientProvider` decorator with a fresh, retry-disabled `QueryClient` (see `src/components/search/search-palette.stories.tsx`). The light/dark toolbar toggle in `.storybook/preview.tsx` sets the `.dark` class on `document.documentElement` (not a wrapper div) so Radix portals (dropdowns, sheets, tooltips) theme correctly.

## Known gotchas

- **`vite.config.ts` → `optimizeDeps.include`** lists `@testing-library/dom`, `@testing-library/jest-dom`, `@hookform/resolvers/zod`, `react-hook-form`, `storybook/test`, and `zod` explicitly. Without this, Vite's dependency scanner misses packages that are only reachable through Storybook's addon virtual modules (e.g. `@storybook/addon-vitest`'s generated project-annotations module), causing sporadic "does not provide an export named ..." errors or "Vite unexpectedly reloaded a test" failures in `vitest run --project=storybook`. If a new dependency triggers the same failure, add it to this list.
- **Radix portals in play tests**: `DialogContent`, `CommandDialog`, and other Radix-portal-rendered content mount outside the story's `canvasElement`, so `within(canvasElement)` won't find anything inside them — query with the global `screen` from `storybook/test` instead once the portal has opened (see `search-palette.stories.tsx`, `edit-client-dialog.stories.tsx`).
- The Google Sign-In button (`useGoogleSignIn`) renders its own iframe and doesn't follow the `.dark` class — a known, accepted limitation for now.
- `oxlint`'s `react/only-export-components` rule (warn-level) flags a few generated shadcn files that export a `cva` variants constant alongside the component (e.g. `button.tsx`, `sidebar.tsx`) — expected and non-blocking.
