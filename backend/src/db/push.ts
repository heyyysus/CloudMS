// Every other script here pulls Node's globals in transitively through a
// package import; this one needs telling where `process` comes from.
/// <reference types="node" />
import "dotenv/config"
import { pushSchema } from "drizzle-kit/api"
import { is, SQL, StringChunk, type SQLWrapper } from "drizzle-orm"
import type { PgDatabase } from "drizzle-orm/pg-core"

// drizzle-kit types its database parameter with the default (empty) schema
// generic, which adminDb's typed schema does not satisfy; the API only ever
// calls execute(), so any Postgres database will do.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDatabase = PgDatabase<any, any, any>
import { adminDb } from "./pools"
import * as schema from "./schema"

// Schema push for the container boot (see Dockerfile CMD), driven through
// drizzle-kit's API instead of `drizzle-kit push --force`.
//
// drizzle-kit reads a table's unique and primary-key constraints with an
// information_schema join that has no ORDER BY, so the column order it sees
// is whatever the planner's join order happens to be. Production returned
// (policy_number, org_id) for auto_policies_org_id_policy_number_unique while
// schema.ts declares (org_id, policy_number); drizzle-kit compares the arrays
// element by element, so it diffed a constraint that was already correct as
// changed, emitted drop + create, and the create hit its truncate prompt on a
// populated table. A container has no TTY to answer on, the CLI then exited 0
// anyway, and the boot looped for three weeks. The API runs the same prompt
// (pgSuggestions), so the fix has to stop the phantom diff before it is
// computed: `pushDatabase` hands drizzle-kit the same rows ordered by the
// constraint's own key positions, and the diff is empty for a correct schema.
//
// A genuinely new unique constraint on a populated table would still prompt;
// ensureUniqueConstraints.ts creates those first, so push never sees one.

// The query drizzle-kit 0.31 issues per table (pgPushIntrospect). Matched on
// the join nothing else in drizzle-kit uses, so an upgrade that changes the
// query falls through to the original rather than to a broken rewrite.
const CONSTRAINT_QUERY =
  /JOIN information_schema\.constraint_column_usage AS ccu USING \(constraint_schema, constraint_name\)/
const TABLE_NAME = /tc\.table_name = '((?:[^']|'')*)'/
const SCHEMA_NAME = /constraint_schema = '((?:[^']|'')*)'/

// The same five columns drizzle-kit selects, for the same table, but each
// constraint's rows in conkey order. Only UNIQUE and PRIMARY KEY rows are
// ever read; FOREIGN KEY rows differ (the original lists the referenced
// table's columns) and are never used.
export function orderedConstraintQuery(text: string): string | null {
  if (!CONSTRAINT_QUERY.test(text)) return null
  const table = TABLE_NAME.exec(text)?.[1]
  const schemaName = SCHEMA_NAME.exec(text)?.[1]
  if (table === undefined || schemaName === undefined) return null
  return `SELECT c.column_name, c.data_type, tc.constraint_type, tc.constraint_name, tc.constraint_schema
      FROM information_schema.table_constraints tc
      JOIN pg_catalog.pg_namespace n ON n.nspname = tc.constraint_schema
      JOIN pg_catalog.pg_class t ON t.relnamespace = n.oid AND t.relname = tc.table_name
      JOIN pg_catalog.pg_constraint con ON con.conrelid = t.oid AND con.conname = tc.constraint_name
      CROSS JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_catalog.pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
      JOIN information_schema.columns c ON c.table_schema = tc.constraint_schema
        AND c.table_name = tc.table_name AND c.column_name = a.attname
      WHERE tc.table_name = '${table}' AND tc.constraint_schema = '${schemaName}'
      ORDER BY tc.constraint_name, k.ord;`
}

// pushSchema wraps every query it runs in sql.raw(), so the text is the one
// StringChunk inside. Anything else is left alone.
function rawText(query: SQLWrapper | string): string | null {
  if (typeof query === "string") return query
  if (!is(query, SQL)) return null
  const parts: string[] = []
  for (const chunk of query.queryChunks) {
    if (!is(chunk, StringChunk)) return null
    parts.push(chunk.value.join(""))
  }
  return parts.join("")
}

// A view of `db` for drizzle-kit: identical except that the constraint query
// comes back ordered.
export function pushDatabase<T extends AnyPgDatabase>(db: T): T {
  const shim: T = Object.create(db)
  shim.execute = ((query: SQLWrapper | string) => {
    const text = rawText(query)
    const ordered = text === null ? null : orderedConstraintQuery(text)
    return db.execute(ordered ?? query)
  }) as T["execute"]
  return shim
}

export async function planPush(db: AnyPgDatabase = adminDb) {
  const { hasDataLoss, warnings, statementsToExecute, apply } = await pushSchema(
    schema,
    pushDatabase(db) as Parameters<typeof pushSchema>[1]
  )
  return { hasDataLoss, warnings, statements: statementsToExecute, apply }
}

// Prints the plan, then applies it unless PUSH_DRY_RUN=1. Like `push --force`
// before it, a statement drizzle-kit flags as data loss is still applied;
// the warning is printed so the deploy log says what was dropped.
export async function runPush(db: AnyPgDatabase = adminDb): Promise<void> {
  const plan = await planPush(db)
  for (const warning of plan.warnings) console.warn(warning)
  if (plan.statements.length === 0) {
    console.log("No changes detected")
    return
  }
  console.log(`${plan.statements.length} statement(s) to apply:`)
  for (const statement of plan.statements) console.log(`  ${statement}`)
  if (process.env.PUSH_DRY_RUN === "1") {
    console.log("PUSH_DRY_RUN=1 - nothing applied")
    return
  }
  await plan.apply()
  console.log("Changes applied")
}

if (require.main === module) {
  runPush()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
