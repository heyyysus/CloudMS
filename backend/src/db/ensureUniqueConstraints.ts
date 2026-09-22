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

// The columns a unique constraint of this name actually covers, in order, or
// null when there is no such constraint. The columns matter as much as the
// name: a release that narrows or widens a unique (auto_policies went from a
// column-level unique on policy_number to an org-scoped one on (org_id,
// policy_number) in 2e9c815) can leave the new name attached to the old
// column list, and push still wants to create the real one. Checking the name
// alone reports that as "already there", skips it, and hands push the prompt
// this whole script exists to avoid.
// drizzle-kit does not read unique constraints from pg_constraint - it reads
// them through information_schema.table_constraints joined to
// constraint_column_usage (see its pgIntrospect). The two can disagree about
// the same table, and it is push's view that decides whether push emits a
// create_unique_constraint and stalls the boot on a prompt. So ask the
// question the way push asks it, and treat that as the source of truth.
async function constraintColumnsAsPushSeesThem(tableName: string): Promise<Map<string, string[]>> {
  const result = await db.execute<{ constraint_name: string; column_name: string }>(
    sql`select tc.constraint_name, c.column_name
        from information_schema.table_constraints tc
        join information_schema.constraint_column_usage as ccu
          using (constraint_schema, constraint_name)
        join information_schema.columns as c
          on c.table_schema = tc.constraint_schema
          and tc.table_name = c.table_name
          and ccu.column_name = c.column_name
        where tc.table_name = ${tableName}
          and tc.constraint_schema = 'public'
          and tc.constraint_type = 'UNIQUE'
        order by c.ordinal_position`
  )
  const byName = new Map<string, string[]>()
  for (const row of result.rows) {
    const columns = byName.get(row.constraint_name)
    if (columns) columns.push(row.column_name)
    else byName.set(row.constraint_name, [row.column_name])
  }
  return byName
}

async function existingConstraintColumns(
  tableName: string,
  constraintName: string
): Promise<string[] | null> {
  const result = await db.execute<{ column_name: string }>(
    sql`select a.attname as column_name
        from pg_constraint c
        join pg_class t on t.oid = c.conrelid
        join pg_namespace n on n.oid = t.relnamespace
        join unnest(c.conkey) with ordinality as k(attnum, ord) on true
        join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
        where n.nspname = 'public'
          and t.relname = ${tableName}
          and c.conname = ${constraintName}
          and c.contype = 'u'
        order by k.ord`
  )
  if (result.rows.length === 0) return null
  return result.rows.map((row) => row.column_name)
}

// Drizzle wraps driver errors in DrizzleQueryError with the pg error on
// `cause`, so the SQLSTATE is never on the error actually thrown here - walk
// the chain for it, the same way repositories/policyLogs.ts does.
function sameColumns(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((column, i) => column === b[i])
}

export function isUniqueViolation(err: unknown): boolean {
  let current = err
  while (typeof current === "object" && current !== null) {
    const code = (current as { code?: string }).code
    if (typeof code === "string") return code === "23505"
    current = (current as { cause?: unknown }).cause
  }
  return false
}

async function ensure(
  tableName: string,
  constraint: UniqueConstraint,
  asPushSeesIt: Map<string, string[]>
): Promise<boolean> {
  // Two views, and both have to agree before this constraint is left alone:
  // pg_constraint decides whether ALTER TABLE ... ADD would collide, and
  // push's view decides whether push still wants to create it.
  const actual = await existingConstraintColumns(tableName, constraint.name)
  const visible = asPushSeesIt.get(constraint.name) ?? null
  if (
    actual !== null &&
    visible !== null &&
    sameColumns(actual, constraint.columns) &&
    sameColumns(visible, constraint.columns)
  ) {
    return false
  }
  const existing = actual

  const columns = sql.join(
    constraint.columns.map((column) => sql.identifier(column)),
    sql`, `
  )
  const nullsNotDistinct = constraint.nullsNotDistinct ? sql` nulls not distinct` : sql``

  // A stale definition under the right name is replaced, not left alone -
  // push would drop it too. Both statements go in one transaction so a
  // failure to add the new one puts the old one back rather than leaving the
  // table with neither.
  try {
    await db.transaction(async (tx) => {
      if (existing !== null) {
        await tx.execute(
          sql`alter table ${sql.identifier(tableName)}
              drop constraint ${sql.identifier(constraint.name)}`
        )
      }
      await tx.execute(
        sql`alter table ${sql.identifier(tableName)}
            add constraint ${sql.identifier(constraint.name)}
            unique${nullsNotDistinct} (${columns})`
      )
    })
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
    const asPushSeesIt = await constraintColumnsAsPushSeesThem(tableName)
    for (const constraint of constraints) {
      const before = await existingConstraintColumns(tableName, constraint.name)
      const seen = asPushSeesIt.get(constraint.name) ?? null
      if (await ensure(tableName, constraint, asPushSeesIt)) {
        const how =
          before === null
            ? "Added missing"
            : `Replaced stale (pg_constraint had ${before.join(", ")}; push saw ${
                seen === null ? "nothing" : seen.join(", ")
              })`
        console.log(`${how} unique constraint ${constraint.name} on ${tableName}`)
        created++
      } else {
        // Logged for every constraint, not just the ones changed. When push
        // stalls on a prompt for a constraint this step believes is already
        // correct, "0 added" is not enough to tell anyone why - this line is
        // what says which of the two views disagrees, and how.
        console.log(
          `Unique constraint ${constraint.name} on ${tableName} ok ` +
            `(declared ${constraint.columns.join(", ")}; ` +
            `pg_constraint ${before === null ? "nothing" : before.join(", ")}; ` +
            `push ${seen === null ? "nothing" : seen.join(", ")})`
        )
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
