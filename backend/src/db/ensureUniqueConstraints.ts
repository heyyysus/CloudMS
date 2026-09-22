import "dotenv/config"
import { is, sql } from "drizzle-orm"
import { getTableConfig, PgTable } from "drizzle-orm/pg-core"
import { adminDb as db } from "./index"
import * as schema from "./schema"

// Runs once at container start, before `drizzle-kit push` (see Dockerfile
// CMD). push cannot add a unique constraint to a table that already holds
// rows without asking first: pgSuggestions prompts "do you want to truncate
// <table>?" for every create_unique_constraint statement, and it does so
// before --force is ever consulted, so --force does not suppress it. With no
// TTY the prompt throws, and push then exits 0 anyway - the boot sails past
// it and the constraint is never created (see push.ts, which turns that
// swallowed failure into a hard stop).
//
// Creating the constraints here first means push has no such statement left
// to prompt about. It is the only interactive prompt on push's path, so once
// these exist push is genuinely non-interactive.
//
// Idempotent and safe against live data: a constraint already present is
// skipped, and a table that does not exist yet (a fresh database, where push
// is about to create it with the constraint inline) is skipped too. Real
// duplicates abort the boot rather than getting truncated away - dropping
// production rows is never the right answer to a numbering collision.
type UniqueConstraint = {
  name: string
  columns: string[]
  nullsNotDistinct: boolean
}

// Every unique constraint schema.ts declares, both the table-level `unique()`
// entries and the column-level `.unique()` ones - push emits a
// create_unique_constraint statement for both, so both can prompt.
export function declaredUniqueConstraints(table: PgTable): {
  tableName: string
  constraints: UniqueConstraint[]
} {
  const config = getTableConfig(table)
  const constraints: UniqueConstraint[] = []

  for (const unique of config.uniqueConstraints) {
    const columns = unique.columns.map((column) => column.name)
    constraints.push({
      name: unique.name ?? `${config.name}_${columns.join("_")}_unique`,
      columns,
      nullsNotDistinct: unique.nullsNotDistinct ?? false,
    })
  }

  for (const column of config.columns) {
    if (!column.isUnique) continue
    constraints.push({
      name: column.uniqueName ?? `${config.name}_${column.name}_unique`,
      columns: [column.name],
      nullsNotDistinct: false,
    })
  }

  return { tableName: config.name, constraints }
}

async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(
    sql`select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${name}
    ) as exists`
  )
  return result.rows[0]?.exists === true
}

// Matched on name rather than on columns, because that is what push itself
// diffs on: a same-columns constraint under a different name would still
// leave push wanting to create this one.
async function constraintExists(tableName: string, constraintName: string): Promise<boolean> {
  const result = await db.execute<{ exists: boolean }>(
    sql`select exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = ${tableName}
        and c.conname = ${constraintName}
        and c.contype = 'u'
    ) as exists`
  )
  return result.rows[0]?.exists === true
}

// Drizzle wraps driver errors in DrizzleQueryError with the pg error on
// `cause`, so the SQLSTATE is never on the error actually thrown here - walk
// the chain for it, the same way repositories/policyLogs.ts does.
export function isUniqueViolation(err: unknown): boolean {
  let current = err
  while (typeof current === "object" && current !== null) {
    const code = (current as { code?: string }).code
    if (typeof code === "string") return code === "23505"
    current = (current as { cause?: unknown }).cause
  }
  return false
}

async function ensure(tableName: string, constraint: UniqueConstraint): Promise<boolean> {
  if (await constraintExists(tableName, constraint.name)) return false

  const columns = sql.join(
    constraint.columns.map((column) => sql.identifier(column)),
    sql`, `
  )
  const nullsNotDistinct = constraint.nullsNotDistinct ? sql` nulls not distinct` : sql``

  try {
    await db.execute(
      sql`alter table ${sql.identifier(tableName)}
          add constraint ${sql.identifier(constraint.name)}
          unique${nullsNotDistinct} (${columns})`
    )
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
    const columnList = constraint.columns.join(", ")
    throw new Error(
      `Cannot add ${constraint.name}: ${tableName} already holds duplicate ` +
        `(${columnList}) values. Resolve them before deploying - find them with:\n` +
        `  select ${columnList}, count(*) from ${tableName} ` +
        `group by ${columnList} having count(*) > 1;`,
      { cause: err }
    )
  }
  return true
}

export async function ensureUniqueConstraints(): Promise<number> {
  let created = 0

  for (const value of Object.values(schema)) {
    if (!is(value, PgTable)) continue
    const table: PgTable = value
    const { tableName, constraints } = declaredUniqueConstraints(table)
    if (constraints.length === 0) continue
    if (!(await tableExists(tableName))) {
      console.log(`Skipped ${tableName} (table does not exist yet)`)
      continue
    }
    for (const constraint of constraints) {
      if (await ensure(tableName, constraint)) {
        console.log(`Added missing unique constraint ${constraint.name} on ${tableName}`)
        created++
      }
    }
  }

  console.log(`Ensured unique constraints (${created} added)`)
  return created
}

// Only when run as the boot step, so the tests can import the function above
// without the module exiting the process out from under them.
if (require.main === module) {
  ensureUniqueConstraints()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
