import { sql } from "drizzle-orm"
import { randomInt } from "crypto"
import { afterEach, describe, expect, it } from "vitest"
import { adminDb } from "./index"
import { orderedConstraintQuery, planPush, pushDatabase } from "./push"

// Verbatim from drizzle-kit 0.31's pgPushIntrospect: the query the shim has
// to recognise and replace. If an upgrade changes it, this is the test that
// says the shim went quiet.
function drizzleKitQuery(table: string): string {
  return `SELECT c.column_name, c.data_type, constraint_type, constraint_name, constraint_schema
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name)
      JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name AND ccu.column_name = c.column_name
      WHERE tc.table_name = '${table}' and constraint_schema = 'public';`
}

type Row = {
  column_name: string
  data_type: string
  constraint_type: string
  constraint_name: string
  constraint_schema: string
}

const probes: string[] = []

afterEach(async () => {
  for (const table of probes.splice(0)) {
    await adminDb.execute(sql`drop table if exists ${sql.identifier(table)}`)
  }
})

// A table whose unique constraint is declared in the opposite order to its
// columns, so table order and key order disagree the way production's
// auto_policies did.
async function probeTable(): Promise<string> {
  const table = `push_probe_${randomInt(1e9)}`
  await adminDb.execute(
    sql`create table ${sql.identifier(table)} (
      a integer primary key,
      b integer,
      c integer,
      constraint ${sql.identifier(`${table}_c_a_unique`)} unique (c, a)
    )`
  )
  probes.push(table)
  return table
}

describe("orderedConstraintQuery", () => {
  it("rewrites drizzle-kit's constraint query to key order", () => {
    const rewritten = orderedConstraintQuery(drizzleKitQuery("auto_policies"))
    expect(rewritten).toContain("WITH ORDINALITY")
    expect(rewritten).toContain("ORDER BY tc.constraint_name, k.ord")
    expect(rewritten).toContain("tc.table_name = 'auto_policies'")
    expect(rewritten).toContain("tc.constraint_schema = 'public'")
  })

  it("leaves every other query alone", () => {
    expect(orderedConstraintQuery('select count(*) as count from "auto_policies"')).toBeNull()
    expect(
      orderedConstraintQuery(
        "SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name)"
      )
    ).toBeNull()
  })
})

describe("pushDatabase", () => {
  it("returns unique constraint columns in key order, not table order", async () => {
    const table = await probeTable()
    const result = await pushDatabase(adminDb).execute<Row>(sql.raw(drizzleKitQuery(table)))
    const unique = result.rows.filter((row) => row.constraint_type === "UNIQUE")
    expect(unique.map((row) => row.column_name)).toEqual(["c", "a"])
    expect(unique[0]).toMatchObject({
      data_type: "integer",
      constraint_name: `${table}_c_a_unique`,
      constraint_schema: "public",
    })
    expect(result.rows.filter((row) => row.constraint_type === "PRIMARY KEY")).toHaveLength(1)
  })

  it("passes any other query through unchanged", async () => {
    const result = await pushDatabase(adminDb).execute<{ n: number }>(sql.raw("select 1 as n"))
    expect(result.rows).toEqual([{ n: 1 }])
  })
})

describe("planPush", () => {
  // The whole point: a database whose unique constraints already match
  // schema.ts gets no constraint statements, whatever order the planner
  // returns their columns in. (Policies from rls.ts are not in schema.ts and
  // do show up here, as they did under the CLI; they are not what this
  // guards.)
  it("plans no unique constraint changes for an up-to-date schema", async () => {
    const plan = await planPush()
    const constraintStatements = plan.statements.filter((statement) =>
      /(ADD|DROP) CONSTRAINT/.test(statement)
    )
    expect(constraintStatements).toEqual([])
  })
})
