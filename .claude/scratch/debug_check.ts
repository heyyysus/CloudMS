import "dotenv/config"
import { Client } from "pg"
const c = new Client({ connectionString: process.env.DATABASE_URL })
await c.connect()
const res = await c.query(`select id, first_name, last_name, org_id from persons where last_name = 'AutoPolicyRepoTest'`)
console.log(res.rows)
const res2 = await c.query(`select id, named_insured_id, org_id from clients`)
console.log(res2.rows)
await c.end()
