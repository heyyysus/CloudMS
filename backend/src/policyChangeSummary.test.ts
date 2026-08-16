import { describe, expect, it } from "vitest"
import {
  buildPolicyChangeFormPdf,
  formatChangeSummaryText,
  summarizePolicyChanges,
  type PolicyDetail,
} from "./policyChangeSummary"
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
    maritalStatus: "single",
    relationToInsured: "other",
  } as PolicyDetail["policyDrivers"][number]["driver"]["person"]
}

// A policyDrivers row wrapping `person`, with the driver-level fields the
// summary reports. Overrides cover the nullable ones.
function policyDriver(p: ReturnType<typeof person>, driverOverrides: Record<string, unknown> = {}) {
  return {
    driver: { person: p, dlNumber: null, rating: "rated", sr22: false, ...driverOverrides },
  } as PolicyDetail["policyDrivers"][number]
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
    // Neither of these fixtures carries coverage, so the added vehicle falls
    // back to a bare label line - see the next test for the usual case.
    expect(lines).toContain("Vehicle added: 2022 Toyota Camry (VIN NEWVIN)")
    expect(lines).toContain("Vehicle removed: 2018 Ford Focus (VIN OLDVIN)")
    expect(lines).toHaveLength(2)
  })

  it("lists every coverage carried by an added vehicle, skipping the blank ones", () => {
    const added = {
      id: 3,
      policyId: 1,
      vin: "NEWVIN",
      make: "Toyota",
      model: "Camry",
      year: 2022,
      garagingZip: "90210",
      coverageBi: "100/300",
      coveragePd: "50,000",
      coverageUmbi: null,
      coverageUmpd: "",
      coverageCdw: "   ",
      coverageColl: "500",
      coverageComp: "250",
    } as PolicyDetail["vehicles"][number]

    const lines = summarizePolicyChanges(makePolicy(), makePolicy({ vehicles: [added] }), {
      vehicles: [],
    })
    // Ordered by VEHICLE_FIELD_LABELS; null, empty and whitespace-only
    // coverages are left off entirely.
    expect(lines).toEqual([
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Garaging ZIP: 90210",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Bodily injury coverage: 100/300",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Property damage coverage: 50,000",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Collision deductible: 500",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Comprehensive deductible: 250",
    ])
  })

  it("reports a coverage/deductible change on a vehicle that keeps its VIN", () => {
    const before = makePolicy({
      vehicles: [
        {
          id: 1,
          policyId: 1,
          vin: "SAMEVIN",
          make: "Honda",
          model: "Civic",
          year: 2020,
          coverageColl: "500",
        } as PolicyDetail["vehicles"][number],
      ],
    })
    const after = makePolicy({
      vehicles: [
        {
          id: 1,
          policyId: 1,
          vin: "SAMEVIN",
          make: "Honda",
          model: "Civic",
          year: 2020,
          coverageColl: "1,000",
        } as PolicyDetail["vehicles"][number],
      ],
    })

    const input: UpdatePolicyInput = { vehicles: [] }
    const lines = summarizePolicyChanges(before, after, input)
    expect(lines).toEqual(["2020 Honda Civic (VIN SAMEVIN) — Collision deductible: 500 → 1,000"])
  })

  it("reports added and removed drivers by person when the drivers key is present", () => {
    const kept = policyDriver(person(1, "Jane", "Kept"))
    const removed = policyDriver(person(2, "John", "Removed"))
    const added = policyDriver(person(3, "Alex", "Added"))

    const before = makePolicy({ policyDrivers: [kept, removed] })
    const after = makePolicy({ policyDrivers: [kept, added] })

    const input: UpdatePolicyInput = { drivers: [] }
    const lines = summarizePolicyChanges(before, after, input)
    // A removal stays a single line; an addition expands into its details.
    expect(lines).toContain("Driver removed: John Removed")
    expect(lines.filter((line) => line.startsWith("Driver added: Alex Added — "))).not.toHaveLength(
      0
    )
    expect(lines).not.toContain("Driver added: Alex Added")
  })

  it("lists every detail of an added driver", () => {
    const added = policyDriver(
      {
        ...person(3, "Alex", "Added"),
        dateOfBirth: "1991-05-12",
        maritalStatus: "married",
        relationToInsured: "significant-other",
      } as PolicyDetail["policyDrivers"][number]["driver"]["person"],
      { dlNumber: "D1234567", rating: "excluded", sr22: true }
    )

    const lines = summarizePolicyChanges(makePolicy(), makePolicy({ policyDrivers: [added] }), {
      drivers: [],
    })
    expect(lines).toEqual([
      "Driver added: Alex Added — Date of birth: 05/12/1991",
      "Driver added: Alex Added — Relation to insured: Significant other",
      "Driver added: Alex Added — Marital status: Married",
      "Driver added: Alex Added — DL number: D1234567",
      "Driver added: Alex Added — Rating: Excluded",
      "Driver added: Alex Added — SR-22: Yes",
    ])
  })

  it("omits an added driver's marital status and DL number when they are unset", () => {
    const added = policyDriver(
      {
        ...person(3, "Alex", "Added"),
        maritalStatus: null,
      } as PolicyDetail["policyDrivers"][number]["driver"]["person"],
      { dlNumber: null }
    )

    const lines = summarizePolicyChanges(makePolicy(), makePolicy({ policyDrivers: [added] }), {
      drivers: [],
    })
    expect(lines).toEqual([
      "Driver added: Alex Added — Date of birth: 01/01/1990",
      "Driver added: Alex Added — Relation to insured: Other",
      "Driver added: Alex Added — Rating: Rated",
      "Driver added: Alex Added — SR-22: No",
    ])
  })
})

describe("formatChangeSummaryText", () => {
  it("nests a multi-detail group under its label", () => {
    const text = formatChangeSummaryText([
      "Status: pending → active",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Garaging ZIP: 90210",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Bodily injury coverage: 100/300",
    ])
    expect(text).toBe(
      [
        "- Status: pending → active",
        "- Vehicle added: 2022 Toyota Camry (VIN NEWVIN)",
        "  - Garaging ZIP: 90210",
        "  - Bodily injury coverage: 100/300",
      ].join("\n")
    )
  })
})

describe("buildPolicyChangeFormPdf", () => {
  it("renders a valid, non-empty PDF for a mix of scalar and multi-field vehicle changes", async () => {
    const policy = makePolicy()
    const changes = [
      "Status: pending → active",
      "2020 Honda Civic (VIN SAMEVIN) — Collision deductible: 500 → 1,000",
      "2020 Honda Civic (VIN SAMEVIN) — Comprehensive deductible: 250 → 500",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Garaging ZIP: 90210",
      "Vehicle added: 2022 Toyota Camry (VIN NEWVIN) — Bodily injury coverage: 100/300",
      "Driver added: Alex Added — Date of birth: 05/12/1991",
      "Driver added: Alex Added — Relation to insured: Spouse",
    ]

    const pdf = await buildPolicyChangeFormPdf(
      {
        policy,
        clientName: "Jane Doe",
        editedBy: { name: "Agent Smith", email: "agent@example.com" },
        editedAt: new Date("2026-01-01T00:00:00.000Z"),
        endorsementEffectiveDate: "2026-01-15",
      },
      changes
    )

    expect(pdf.length).toBeGreaterThan(0)
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-")
  })
})
