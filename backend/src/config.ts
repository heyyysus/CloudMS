// App-level config, read from process.env per call rather than cached at
// module load - the convention jobs/config.ts, mailer.ts and storage/r2.ts
// all follow, and what lets tests stub a value between cases.

function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function demoMode(): boolean {
  return process.env.DEMO_MODE === "true"
}

export function demoSessionTtlMs(): number {
  return num("DEMO_SESSION_TTL_MINUTES", 240) * 60 * 1000
}

// Demo-only ceiling: once a table holds this many rows, creates on it are
// refused until the next reseed. Guards against one visitor filling the demo
// database; deliberately generous relative to the seeded fixture set.
export function demoMaxRowsPerTable(): number {
  return num("DEMO_MAX_ROWS_PER_TABLE", 5000)
}
