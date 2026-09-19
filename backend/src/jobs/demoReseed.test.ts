// The demo reseed job's guard and config, unit-tested with an injected fake
// seed function - never the real one. wipe() truncates the whole database
// with no per-context scoping, so calling the real seed()/wipe() here would
// destroy other workers' TestContext fixtures in CI and other agents' data
// locally, exactly what CLAUDE.md's "never run npm run db:seed" rule exists
// to prevent. Wipe semantics (demo users/sessions survive, everything else
// regenerates) are verified separately by hand against a throwaway database;
// see pipeline/101/notes.md.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { demoReseedConfig } from "./config"
import { runDemoReseed, startDemoReseedScheduler } from "./demoReseed"

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.NODE_ENV = "test"
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
})

const EMPTY_COUNTS = {
  users: 0,
  carriers: 0,
  persons: 0,
  clients: 0,
  autoPolicies: 0,
  vehicles: 0,
  policyDrivers: 0,
  policyLogs: 0,
  invoices: 0,
  invoiceItems: 0,
  payments: 0,
  receipts: 0,
  trustLedger: 0,
}

// A promise the test controls the resolution of, so the guard it's holding
// open is always released before the test (and the module-level `running`
// flag it shares with every other test in this file) moves on.
function deferred() {
  let resolve!: () => void
  const promise = new Promise<typeof EMPTY_COUNTS>((res) => {
    resolve = () => res(EMPTY_COUNTS)
  })
  return { promise, resolve }
}

describe("startDemoReseedScheduler", () => {
  it("does not start when DEMO_MODE is unset", () => {
    delete process.env.DEMO_MODE
    expect(startDemoReseedScheduler()).toBeUndefined()
  })

  it("does not start when DEMO_MODE is false", () => {
    process.env.DEMO_MODE = "false"
    expect(startDemoReseedScheduler()).toBeUndefined()
  })

  it("fails closed on a near-miss value", () => {
    process.env.DEMO_MODE = "TRUE"
    expect(startDemoReseedScheduler()).toBeUndefined()
  })

  it("refuses to start under NODE_ENV=test even when demo mode is on", () => {
    process.env.DEMO_MODE = "true"
    process.env.NODE_ENV = "test"
    expect(startDemoReseedScheduler()).toBeUndefined()
  })
})

describe("runDemoReseed overlap guard", () => {
  it("runs only once while a prior call is still in flight", async () => {
    const first = deferred()
    const seedFn = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(EMPTY_COUNTS)

    const firstCall = runDemoReseed(seedFn)
    void runDemoReseed(seedFn)
    await Promise.resolve()
    await Promise.resolve()

    expect(seedFn).toHaveBeenCalledTimes(1)

    // Release the guard so it doesn't leak into the next test.
    first.resolve()
    await firstCall
  })

  it("runs again once the prior call has resolved", async () => {
    const seedFn = vi.fn().mockResolvedValue(EMPTY_COUNTS)

    await runDemoReseed(seedFn)
    await runDemoReseed(seedFn)

    expect(seedFn).toHaveBeenCalledTimes(2)
    expect(seedFn).toHaveBeenCalledWith({ preserveDemoUsers: true })
  })

  it("catches a rejection and releases the guard for the next call", async () => {
    const seedFn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(EMPTY_COUNTS)

    await expect(runDemoReseed(seedFn)).resolves.toBeUndefined()
    await runDemoReseed(seedFn)

    expect(seedFn).toHaveBeenCalledTimes(2)
  })
})

describe("demoReseedConfig", () => {
  it("defaults to 15 minutes", () => {
    delete process.env.DEMO_RESEED_INTERVAL_MINUTES
    expect(demoReseedConfig().intervalMs).toBe(900_000)
  })

  it("honors a configured interval", () => {
    process.env.DEMO_RESEED_INTERVAL_MINUTES = "30"
    expect(demoReseedConfig().intervalMs).toBe(1_800_000)
  })

  it("falls back to the default on garbage input", () => {
    process.env.DEMO_RESEED_INTERVAL_MINUTES = "not-a-number"
    expect(demoReseedConfig().intervalMs).toBe(900_000)
  })

  it("falls back to the default on a non-positive interval", () => {
    process.env.DEMO_RESEED_INTERVAL_MINUTES = "0"
    expect(demoReseedConfig().intervalMs).toBe(900_000)
  })
})
