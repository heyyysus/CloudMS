import { describe, expect, it } from "vitest"
import { summarizePolicyChanges, type PolicyDetail } from "./policyChangeSummary"
import type { UpdatePolicyInput } from "./repositories/autoPolicies"

// Minimal fixture matching getPolicyWithDetails' shape. Fields irrelevant to
// a given test are left at these defaults.
function makePolicy(overrides: Partial<PolicyDetail> = {}): PolicyDetail {
  return {
    id: 1,
    clientId: 1,
    carrierId: 1,
    policyNumber: "POL-1",
    policyAddress1: null,
    policyAddress2: null,
    policyCity: null,
    policyState: null,
    policyZip: null,
    effectiveDate: "2026-01-01",
    expirationDate: "2027-01-01",
    status: "pending",
    createdAt: new Date(),
    updatedAt: new Date(),
    client: {} as PolicyDetail["client"],
    carrier: {
      id: 1,
      name: "Progressive",
      naic: "1234567890",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    vehicles: [],
    policyDrivers: [],
    ...overrides,
  }
}

function person(id: number, firstName: string, lastName: string) {
  return {
    id,
    firstName,
    lastName,
    dateOfBirth: "1990-01-01",
  } as PolicyDetail["policyDrivers"][number]["driver"]["person"]
}

describe("summarizePolicyChanges", () => {
  it("returns no lines when nothing in the input differs", () => {
    const before = makePolicy({ status: "pending" })
    const after = makePolicy({ status: "pending" })
    expect(summarizePolicyChanges(before, after, { status: "pending" })).toEqual([])
  })

  it("reports a scalar field change only when its key was in the input", () => {
    const before = makePolicy({ status: "pending", policyNumber: "POL-1" })
    const after = makePolicy({ status: "active", policyNumber: "POL-1-RENUMBERED" })

    // policyNumber changed too, but wasn't part of this request - must not appear.
    const lines = summarizePolicyChanges(before, after, { status: "active" })
    expect(lines).toEqual(["Status: pending → active"])
  })

  it("reports a carrier change by name, not id", () => {
    const before = makePolicy({
      carrierId: 1,
      carrier: {
        id: 1,
        name: "Progressive",
        naic: "1111111111",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })
    const after = makePolicy({
      carrierId: 2,
      carrier: {
        id: 2,
        name: "Geico",
        naic: "2222222222",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    })

    const lines = summarizePolicyChanges(before, after, { carrierId: 2 })
    expect(lines).toEqual(["Carrier: Progressive → Geico"])
  })

  it("does not report vehicles/drivers unless those keys are present in the input", () => {
    const before = makePolicy()
    const after = makePolicy({
      vehicles: [
        {
          id: 1,
          policyId: 1,
          vin: "VIN1",
          make: "Honda",
          model: "Civic",
          year: 2020,
        } as PolicyDetail["vehicles"][number],
      ],
    })

    expect(summarizePolicyChanges(before, after, { status: "active" })).toEqual([])
  })

  it("reports added and removed vehicles by VIN when the vehicles key is present", () => {
    const keep = {
      id: 1,
      policyId: 1,
      vin: "KEEPVIN",
      make: "Honda",
      model: "Civic",
      year: 2020,
    } as PolicyDetail["vehicles"][number]
    const removed = {
      id: 2,
      policyId: 1,
      vin: "OLDVIN",
      make: "Ford",
      model: "Focus",
      year: 2018,
    } as PolicyDetail["vehicles"][number]
    const added = {
      id: 3,
      policyId: 1,
      vin: "NEWVIN",
      make: "Toyota",
      model: "Camry",
      year: 2022,
    } as PolicyDetail["vehicles"][number]

    const before = makePolicy({ vehicles: [keep, removed] })
    const after = makePolicy({ vehicles: [keep, added] })

    const input: UpdatePolicyInput = { vehicles: [] }
    const lines = summarizePolicyChanges(before, after, input)
    expect(lines).toContain("Vehicle added: 2022 Toyota Camry (VIN NEWVIN)")
    expect(lines).toContain("Vehicle removed: 2018 Ford Focus (VIN OLDVIN)")
    expect(lines).toHaveLength(2)
  })

  it("reports added and removed drivers by person when the drivers key is present", () => {
    const kept = {
      driver: { person: person(1, "Jane", "Kept") },
    } as PolicyDetail["policyDrivers"][number]
    const removed = {
      driver: { person: person(2, "John", "Removed") },
    } as PolicyDetail["policyDrivers"][number]
    const added = {
      driver: { person: person(3, "Alex", "Added") },
    } as PolicyDetail["policyDrivers"][number]

    const before = makePolicy({ policyDrivers: [kept, removed] })
    const after = makePolicy({ policyDrivers: [kept, added] })

    const input: UpdatePolicyInput = { drivers: [] }
    const lines = summarizePolicyChanges(before, after, input)
    expect(lines).toContain("Driver added: Alex Added")
    expect(lines).toContain("Driver removed: John Removed")
    expect(lines).toHaveLength(2)
  })
})
