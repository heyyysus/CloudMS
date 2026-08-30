---
issue: 102
status: pending-review
---
# Demo mode abuse guardrails: request body cap + per-table row ceiling

## Goal

Two independent, cheap guardrails so a single visitor to the demo instance cannot fill
the database or push huge payloads at the API:

1. **Body cap (all modes, prod included):** `express.json()` runs with `limit: "256kb"`
   instead of the 100kb default, and an oversized JSON body gets a **413** with the same
   `{ error: ... }` JSON shape every other error in this API uses — not the generic 500
   the current error handler would produce (see Approach step 1; this is the one real
   deviation from the issue body).
2. **Row ceiling (demo mode only):** when `DEMO_MODE=true`, a create endpoint whose target
   table already holds `DEMO_MAX_ROWS_PER_TABLE` (default 5000) rows answers **429**
   `{ error: "Demo row limit reached; data resets on the next reseed." }`. Reads, updates
   and deletes are untouched, and no state is persisted, so #101's reseed clears the
   condition for free.

Done = `npm run typecheck && npm run lint && npm test` green in `backend/`, with a 413 test
in `src/app.test.ts` and new `src/middleware/demoRowCeiling.test.ts` covering under-ceiling,
at-ceiling and demo-off.

## Scope check

Fits PROJECT.md as infrastructure/hardening around the deployment rather than as a product
pillar: it protects the public demo instance that #98–#101 are building out. It does not
advance any of the four pillars or the five roadmap items directly, and it does not need to —
it is the cost of having a demo at all.

Triage labels look right: `enhancement`, `area:backend`. **This is backend-only** — no
frontend, schema, migration or docs-model change. One caveat worth restating in the PR: the
body cap is not demo-scoped, so it changes production behaviour (issue calls this out; keep
that sentence in the PR description).

### Dependency state (checked, matters for the coder)

`#98` is **not merged** — `origin/agent/issue-98` exists but `main` has no `src/config.ts`
and no `DEMO_MODE` anywhere. On `#98`'s branch the module is `backend/src/config.ts` and it
exports **functions**, not consts:

```ts
export function demoMode(): boolean { return process.env.DEMO_MODE === "true" }
export function demoSessionTtlMs(): number { return num("DEMO_SESSION_TTL_MINUTES", 240) * 60 * 1000 }
```

with a local `num(name, fallback)` helper, reading `process.env` per call rather than caching
at module load — the convention `jobs/config.ts`, `mailer.ts` and `storage/r2.ts` follow.
So **use `demoMode()` / `demoMaxRowsPerTable()` as calls**, not the `demoMode` const and
"parse once" export the issue's pseudocode shows. This is what lets the tests set
`process.env` instead of `vi.mock`-ing the config module.

Branch from `main`. If `backend/src/config.ts` does not exist when coding starts, create it
with exactly the shape above (`num` helper, header comment, `demoMode()`) plus
`demoMaxRowsPerTable()`, so that whichever of #98/#102 lands second merges cleanly.

## Files / areas

| Path | Change |
|---|---|
| `backend/src/app.ts` | `express.json({ limit: "256kb" })` (line 40); extend the error handler (lines 78–97) to map body-parser errors to their own status |
| `backend/src/app.test.ts` | new test: 300kb JSON body → 413 |
| `backend/src/config.ts` | add `demoMaxRowsPerTable()`; create the whole module (matching #98) if it isn't there yet |
| `backend/src/middleware/demoRowCeiling.ts` | new dir + middleware factory |
| `backend/src/middleware/demoRowCeiling.test.ts` | new tests |
| `backend/.env.example` | document `DEMO_MAX_ROWS_PER_TABLE=5000` next to #98's `DEMO_MODE` block (add that block too if #98 hasn't landed) |
| `backend/src/routes/{persons,clients,vehicles,policies,policyLogs,invoices,payments,carriers}.ts` | mount the middleware on the eight create routes |

No migration, no `docs/API.md` change to the endpoint list (the docs stage may want a line
about the two new failure codes; not a blocker).

## Approach

### Step 1 — body cap + a 413 that survives the error handler

1. `backend/src/app.ts:40` → `app.use(express.json({ limit: "256kb" }))`.
2. **The issue's claim that "Express returns 413 automatically" does not hold in this app.**
   `body-parser` calls `next(err)` with an `entity.too.large` error carrying `status = 413`;
   Express only turns that into a 413 in its *default* final handler, and this app registers
   its own error handler at `app.ts:79`, which inspects only Postgres codes and otherwise
   logs and returns `500 {"error":"Internal server error"}`. So add a branch **before** the
   `req.log.error(err)` fallback, alongside the existing `23505`/`23503`/`22021` branches:

   ```ts
   // body-parser rejects an oversized or malformed JSON body with its own
   // status; without this the fallback below would report it as a 500.
   const status = (err as { status?: number; statusCode?: number }).status ?? ...statusCode
   if (typeof status === "number" && status >= 400 && status < 500) {
     res.status(status).json({ error: status === 413 ? "Request body too large" : "Invalid request body" })
     return
   }
   ```

   Extend the local `PgError` interface (or add a small `HttpError` interface next to it) with
   `status?: number` / `statusCode?: number` rather than casting inline, to match the file's style.
   Keep the JSON `{ error }` shape — every route in this API answers that way, and the frontend
   reads `error` off the body.
3. Write the test first and confirm it fails as a 500; that verifies the paragraph above rather
   than trusting it. If it already comes back 413, drop step 2's handler change and say so in
   `notes.md`.

Sanity check on the 256kb ceiling (done during planning, worth re-confirming): the only
plausibly-large payloads are outbound mail bodies (`routes/mail.ts`) and correspondence/email
templates — all a few kb. Attachments are presigned direct-to-R2 (`routes/policyAttachments.ts`).
The TurboRater `.tt2x` import is parsed **client-side** (`frontend/src/lib/integration-file.ts`)
and only the extracted fields are posted, so the raw file never crosses the API. 256kb is
roughly 2.5× the current default and far above anything legitimate.

### Step 2 — config

Add to `backend/src/config.ts`, reusing the module's `num` helper:

```ts
// Demo-only ceiling: once a table holds this many rows, creates on it are
// refused until the next reseed. Guards against one visitor filling the demo
// database; deliberately generous relative to the seeded fixture set.
export function demoMaxRowsPerTable(): number {
  return num("DEMO_MAX_ROWS_PER_TABLE", 5000)
}
```

`num` already falls back on a non-numeric value; no extra validation needed.

### Step 3 — the middleware

New file `backend/src/middleware/demoRowCeiling.ts` (new directory; the issue allows putting it
beside `auth/middleware.ts`, but a `middleware/` dir is the cleaner home for cross-cutting,
non-auth middleware and matches how the issue names it):

```ts
import { sql } from "drizzle-orm"
import type { PgTable } from "drizzle-orm/pg-core"
import { NextFunction, Request, Response } from "express"
import { demoMaxRowsPerTable, demoMode } from "../config"
import { db } from "../db"

export function demoRowCeiling(table: PgTable) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!demoMode()) return next()
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(table)
    if (Number(row.count) >= demoMaxRowsPerTable()) {
      res.status(429).json({ error: "Demo row limit reached; data resets on the next reseed." })
      return
    }
    next()
  }
}
```

Notes for the coder:
- The `db.select({ count: sql<number>\`count(*)\` }).from(table)` shape already exists at
  `src/repositories/policyAttachments.ts:80` and in `src/db/seed/run.ts` — copy it, and keep
  the `Number(...)` coercion since `pg` returns `count` as a string.
- Return `void` (`res.status(...).json(...); return`), not `return res...` — that's the
  convention in `auth/middleware.ts` and every route handler here, and it keeps the
  `RequestHandler` type clean.
- Express 5 forwards a rejected async handler to the error handler automatically, so no
  try/catch. When demo mode is off the function returns before touching the database, so
  production pays nothing.
- No index, no cache — `count(*)` at ≤5000 rows is sub-millisecond, and this is the demo box.

### Step 4 — mount it

Insert `demoRowCeiling(<table>)` immediately after `requireAuth` (and after `requireRole` on
carriers, so an unauthenticated/unauthorised caller still gets 401/403 rather than a 429 that
leaks table sizes). Router calls that are currently one-liners (`persons`, `clients`,
`vehicles`, `policies`, `policyLogs`, `invoices`, `payments`) become the multi-arg formatting
Prettier already produces for `carriers.ts:37` — run `npm run format` after.

Verified line numbers on `main`, all matching the issue:

| Route | Line | Table |
|---|---|---|
| `POST /persons` | `routes/persons.ts:31` | `persons` |
| `POST /clients` | `routes/clients.ts:44` | `clients` |
| `POST /vehicles` | `routes/vehicles.ts:41` | `vehicles` |
| `POST /policies` | `routes/policies.ts:161` | `autoPolicies` |
| `POST /policy-logs` | `routes/policyLogs.ts:19` | `policyLogs` |
| `POST /invoices` | `routes/invoices.ts:53` | `invoices` |
| `POST /payments` | `routes/payments.ts:52` | `payments` |
| `POST /carriers` | `routes/carriers.ts:37` | `carriers` (already `requireRole("admin")`) |

Deliberately **not** covered: `invoices.ts:88` and `payments.ts:89` (child/bulk POSTs bounded
by their parent), policy attachments (#99 disables them in demo), users/templates/reminder
rules (admin-only, tiny). Tables written as a side effect of a covered create —
`drivers`, `policyDrivers`, `invoiceItems`, `receipts`, `trustLedger`, `clientPhones`,
`clientEmails` — are bounded transitively by the parent's ceiling; that is intended and
should be stated in `notes.md` rather than fixed.

## Tests

**`src/app.test.ts`** — add a `describe("request body limit")`:
- `POST /health` with `{ big: "x".repeat(300_000) }` → **413**, body `{ error: <string> }`.
  `express.json` runs at app level before routing, so it rejects the body regardless of the
  route's method/existence and no session cookie is needed.
- Optionally a companion case: a small JSON body on the same path is *not* 413 (guards against
  the limit being misparsed as bytes-vs-string).

**`src/middleware/demoRowCeiling.test.ts`** (new) — supertest against a minimal
`express()` app: `express.json()` + `app.post("/t", demoRowCeiling(persons), (_req, res) => res.json({ ok: true }))`.
Drive config through `process.env` (no `vi.mock` needed, since `config.ts` reads per call);
snapshot and restore `process.env.DEMO_MODE` / `DEMO_MAX_ROWS_PER_TABLE` in `beforeEach`/`afterEach`.

Cases:
1. **Under the ceiling** — `DEMO_MODE=true`, `DEMO_MAX_ROWS_PER_TABLE=1000000` → 200 `{ ok: true }`.
2. **At the ceiling** — `DEMO_MODE=true`, `DEMO_MAX_ROWS_PER_TABLE=1` → 429 with the exact error
   string. Create one `persons` row through `TestContext` first so the table is guaranteed
   non-empty, and `ctx.cleanup()` after.
3. **Demo off** — `DEMO_MODE` unset (or `"false"`), `DEMO_MAX_ROWS_PER_TABLE=1` → 200.

Concurrency (CLAUDE.md): **do not** use the issue's `current count + 1` ceiling — reading
`count(*)` and then asserting on it is racy when another agent inserts between the two
queries. The `1` / `1_000_000` bracketing above asserts no global count, needs no truncation,
and holds no matter what else is in the database. `TestContext` from `src/routes/testHelpers.ts`
supplies the person fixture with its random suffix and cleans up only its own rows.

Run in `backend/`: `npm run typecheck && npm run lint && npm run format:check && npm test`.
No migration is needed, so `npx tsx src/db/migrate.ts` is not part of this task.

## Touches backend

**yes** — backend-only.

## Risks / open questions

- **The 413 depends on the error-handler change.** Highest-value thing to verify first
  (Approach step 1.3). If it is skipped, the cap still works but reports 500, which is worse
  than the status quo for debugging.
- **Broadening the error handler to all 4xx `err.status` values** also changes how malformed
  JSON is reported: today a bad JSON body yields 500, after this it yields 400. That is
  strictly more correct, but it *is* a second production behaviour change — mention it in the
  PR description next to the body cap. If the reviewer prefers a minimal blast radius, narrow
  the branch to `err.type === "entity.too.large"` only.
- **429 is a debatable code** for "table full" (`507`/`403` are arguable; 429 implies retry-after
  semantics that don't apply here). Keeping 429 because the issue specifies it and the message
  body carries the real explanation. Flag, don't change, unless the reviewer says otherwise.
- **#98 not merged.** If both branches land, `app.ts` (imports + the `app.use` block around
  line 40–47) and `config.ts` will conflict textually. Both conflicts are trivial; whoever
  merges second resolves. Copy #98's `config.ts` verbatim if creating it here.
- One extra `count(*)` per create request in demo mode only; negligible at demo scale, zero
  cost in production.
- The ceiling is per-table, so a visitor can still create 5000 rows in *each* of eight tables.
  That is the intended, deliberately cheap bound.

## Out of scope

- nginx / application-level rate limiting (explicitly deferred by the issue).
- The reseed job (#101) and anything assuming a reset schedule.
- Demo-mode write blocking on attachments (#99) and the `DEMO_MODE` flag itself (#98).
- Per-IP or per-session quotas, `Retry-After` headers, row ceilings on child/bulk endpoints.
- Any frontend handling of the new 413/429 responses — the generic API error path already
  surfaces `{ error }`.
- Indexing or caching the row counts.
