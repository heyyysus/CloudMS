import { sql } from "drizzle-orm"
import { db } from "../db"
import { reminderConfig } from "./config"

// A constant, arbitrary key. Every container using the same number is the
// point - it is what makes them contend for one lock. Exported so a test can
// hold it from its own connection.
export const PLANNER_LOCK_KEY = 8_472_119

export interface PlanResult {
  // False when another container held the lock, so the caller can tell
  // "nothing was due" apart from "someone else is already planning".
  planned: boolean
  created: number
}

// Anything that can run a statement - the pool, or a transaction handle.
type Executor = Pick<typeof db, "execute">

// Turns enabled rules into scheduled_emails rows for the policies they match,
// unconditionally.
//
// One INSERT ... SELECT ... ON CONFLICT DO NOTHING, which is what makes this
// safe to run as often as anyone likes and from as many places at once: the
// unique on (rule_id, policy_id, occurrence_date) means a re-plan writes
// nothing. Correctness never depends on the advisory lock below.
export async function planDueReminders(executor: Executor = db): Promise<number> {
  const cfg = reminderConfig()

  const inserted = await executor.execute(sql`
    insert into scheduled_emails (rule_id, policy_id, occurrence_date, scheduled_for)
    select r.id,
           p.id,
           p.expiration_date,
           -- The first AT TIME ZONE reads the wall-clock send time *as* agency
           -- local time (so Postgres applies the right DST offset for that
           -- date); the second converts the resulting instant back to a UTC
           -- wall clock for storage. Pinning UTC explicitly keeps the stored
           -- value independent of the database session's TimeZone setting,
           -- which is what drizzle assumes when it reads the column back.
           (((p.expiration_date - r.offset_days) + make_interval(hours => ${cfg.sendHour}))
             at time zone ${cfg.timeZone}) at time zone 'UTC'
    from reminder_rules r
    join auto_policies p on p.status = 'active'
    where r.enabled
      and r.trigger = 'policy_expiration'
      and (p.expiration_date - r.offset_days)
            between current_date - ${cfg.lookbackDays}::int
                and current_date + ${cfg.horizonDays}::int
      and exists (
        select 1 from client_emails ce where ce.client_id = p.client_id
      )
    -- Holds each matched rule against concurrent deletion. Without it an admin
    -- deleting a rule between this SELECT and the FK check aborts the whole
    -- plan with a foreign key violation; deletes are rare enough that making
    -- them wait out a plan is the cheaper side of the trade.
    for share of r
    on conflict (rule_id, policy_id, occurrence_date) do nothing
    returning id
  `)

  return inserted.rows.length
}

// The scheduled-tick entry point: plans only if this container wins the
// election. The lock is purely an optimization to stop N replicas doing
// identical work every minute - a caller that genuinely wants to plan now
// (the manual tick route) calls planDueReminders directly instead.
//
// pg_try_advisory_xact_lock, not the session variant: an xact lock is released
// by commit, rollback, or the connection dying, so a container killed mid-plan
// cannot strand it.
export async function planReminders(): Promise<PlanResult> {
  return db.transaction(async (tx) => {
    const lock = await tx.execute<{ locked: boolean }>(
      sql`select pg_try_advisory_xact_lock(${PLANNER_LOCK_KEY}) as locked`
    )
    if (!lock.rows[0]?.locked) return { planned: false, created: 0 }

    return { planned: true, created: await planDueReminders(tx) }
  })
}
