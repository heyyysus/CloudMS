import { AsyncLocalStorage } from "node:async_hooks"
import { sql } from "drizzle-orm"
import { appDb } from "./pools"

type NodePgTx = Parameters<Parameters<typeof appDb.transaction>[0]>[0]

const store = new AsyncLocalStorage<{ orgId: string; tx: NodePgTx }>()

// Opens (or reuses) a request-long transaction scoped to orgId: every query
// issued through `db` while fn runs - directly, or via anything fn calls -
// goes over this transaction's connection with `app.org_id` set, which is
// what rls.ts's policies key off of. Reused rather than reopened when called
// again for the same org (e.g. a repository helper calling another that also
// wraps itself in runInOrg) so nested calls read their own uncommitted
// writes instead of racing a second connection against them.
export async function runInOrg<T>(orgId: string, fn: () => Promise<T>): Promise<T> {
  const active = store.getStore()
  if (active) {
    if (active.orgId !== orgId) throw new Error("Nested runInOrg for a different org")
    return fn()
  }
  return appDb.transaction(async (tx) => {
    // set_config(..., true) rather than `SET LOCAL app.org_id = $1`: SET
    // takes a literal, not a bind parameter. Same trick roles.ts uses for the
    // app role's password, see that file's comment for why.
    await tx.execute(sql`SELECT set_config('app.org_id', ${orgId}, true)`)
    return store.run({ orgId, tx }, fn)
  })
}

export function currentOrgId(): string | undefined {
  return store.getStore()?.orgId
}

// Every existing `import { db } from "../db"` call site keeps working
// unchanged: outside any runInOrg scope this proxies straight through to
// appDb (an unscoped connection - no rows pass rls.ts's policies), and inside
// one it proxies to that scope's transaction instead. Cast to typeof appDb so
// every call site keeps its current types; the proxy only changes which
// connection a call runs on, never the shape of what it returns.
export const db = new Proxy(appDb, {
  get(_target, prop, _receiver) {
    const active = store.getStore()?.tx ?? appDb
    const value = Reflect.get(active, prop, active)
    return typeof value === "function" ? value.bind(active) : value
  },
}) as typeof appDb
