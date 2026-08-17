import { eq } from "drizzle-orm"
import { createAutoPolicyWithDetails } from "../../repositories/autoPolicies"
import type { Carrier, PolicyStatus } from "../../types"
import { db } from "../index"
import { autoPolicies } from "../schema"
import type { Household } from "./households"
import { addDays, chunk, faker, toDateString } from "./rng"

export interface SeededPolicy {
  id: number
  effectiveDate: string
  expirationDate: string
  status: PolicyStatus
}

const MAX_POLICIES_PER_CLIENT = 6

function pickPolicyCounts(clientCount: number, totalPolicies: number): number[] {
  const counts = Array.from({ length: clientCount }, () =>
    faker.helpers.weightedArrayElement([
      { value: 1, weight: 45 },
      { value: 2, weight: 35 },
      { value: 3, weight: 12 },
      { value: 4, weight: 6 },
      { value: 5, weight: 2 },
    ])
  )

  let sum = counts.reduce((a, b) => a + b, 0)
  while (sum !== totalPolicies) {
    const i = faker.number.int({ min: 0, max: clientCount - 1 })
    if (sum < totalPolicies && counts[i] < MAX_POLICIES_PER_CLIENT) {
      counts[i]++
      sum++
    } else if (sum > totalPolicies && counts[i] > 1) {
      counts[i]--
      sum--
    }
  }
  return counts
}

const STATUS_WEIGHTS = [
  { value: "active" as const, weight: 65 },
  { value: "expired" as const, weight: 15 },
  { value: "pending" as const, weight: 10 },
  { value: "cancelled" as const, weight: 10 },
]

function pickStatusAndDates(now: Date): {
  status: PolicyStatus
  effectiveDate: Date
  expirationDate: Date
} {
  const status = faker.helpers.weightedArrayElement(STATUS_WEIGHTS)
  const termDays = faker.number.int({ min: 6, max: 12 }) * 30

  if (status === "pending") {
    const effectiveDate = addDays(now, faker.number.int({ min: 3, max: 45 }))
    return { status, effectiveDate, expirationDate: addDays(effectiveDate, termDays) }
  }

  if (status === "active") {
    const daysIntoTerm = faker.number.int({ min: 0, max: termDays - 1 })
    const effectiveDate = addDays(now, -daysIntoTerm)
    return { status, effectiveDate, expirationDate: addDays(effectiveDate, termDays) }
  }

  if (status === "expired") {
    const expirationDate = addDays(now, -faker.number.int({ min: 1, max: 400 }))
    return { status, effectiveDate: addDays(expirationDate, -termDays), expirationDate }
  }

  // cancelled: bound in the past, cancelled at or before its natural expiration
  const effectiveDate = addDays(now, -faker.number.int({ min: 30, max: 500 }))
  const naturalExpiration = addDays(effectiveDate, termDays)
  const expirationDate =
    naturalExpiration < now
      ? naturalExpiration
      : addDays(effectiveDate, faker.number.int({ min: 15, max: termDays }))
  return { status, effectiveDate, expirationDate }
}

const COVERAGE_BI_UMBI = ["25/50", "50/100", "100/300", "250/500"]
const COVERAGE_FLAT = ["500", "1000", "2500", "5000"]

function optional(value: string): string | null {
  return faker.datatype.boolean({ probability: 0.5 }) ? value : null
}

function buildVehicle(garagingZip: string) {
  return {
    vin: faker.vehicle.vin(),
    make: faker.vehicle.manufacturer(),
    model: faker.vehicle.model(),
    year: faker.number.int({ min: 2005, max: 2026 }),
    garagingZip,
    coverageBi: faker.helpers.arrayElement(COVERAGE_BI_UMBI),
    coveragePd: faker.helpers.arrayElement(COVERAGE_FLAT),
    coverageUmbi: faker.helpers.arrayElement(COVERAGE_BI_UMBI),
    coverageMedpay: faker.helpers.arrayElement(COVERAGE_FLAT),
    coverageComp: faker.helpers.arrayElement(COVERAGE_FLAT),
    coverageColl: faker.helpers.arrayElement(COVERAGE_FLAT),
    coverageUmpd: optional(faker.helpers.arrayElement(COVERAGE_FLAT)),
    coverageCdw: optional(faker.helpers.arrayElement(COVERAGE_FLAT)),
    coverageRentalReimbursement: optional(faker.helpers.arrayElement(COVERAGE_FLAT)),
    coverageTowing: optional(faker.helpers.arrayElement(COVERAGE_FLAT)),
  }
}

export async function seedPolicies(
  households: Household[],
  carriers: Carrier[],
  totalPolicies: number
): Promise<SeededPolicy[]> {
  const counts = pickPolicyCounts(households.length, totalPolicies)
  const now = new Date()

  const jobs: { household: Household; seq: number }[] = []
  let seq = 1
  households.forEach((household, i) => {
    for (let j = 0; j < counts[i]; j++) jobs.push({ household, seq: seq++ })
  })

  const results: SeededPolicy[] = []
  for (const batch of chunk(jobs, 8)) {
    const batchResults = await Promise.all(
      batch.map(async ({ household, seq: n }) => {
        const carrier = faker.helpers.arrayElement(carriers)
        const { status, effectiveDate, expirationDate } = pickStatusAndDates(now)
        const vehicleCount = faker.helpers.weightedArrayElement([
          { value: 1, weight: 70 },
          { value: 2, weight: 30 },
        ])
        const sameAddress = faker.datatype.boolean({ probability: 0.9 })
        const driverPersonIds = faker.helpers.arrayElements(
          household.driverPersonIds,
          Math.min(household.driverPersonIds.length, faker.number.int({ min: 1, max: 3 }))
        )

        const detail = await createAutoPolicyWithDetails({
          clientId: household.client.id,
          carrierId: carrier.id,
          policyNumber: `POL-${String(n).padStart(6, "0")}`,
          policyAddress1: sameAddress
            ? household.client.mailingAddress1
            : faker.location.streetAddress(),
          policyCity: sameAddress ? household.client.mailingCity : faker.location.city(),
          policyState: sameAddress
            ? household.client.mailingState
            : faker.location.state({ abbreviated: true }),
          policyZip: sameAddress ? household.client.mailingZip : faker.location.zipCode("#####"),
          effectiveDate: toDateString(effectiveDate),
          expirationDate: toDateString(expirationDate),
          status,
          vehicles: Array.from({ length: vehicleCount }, () => buildVehicle(household.zip)),
          drivers: driverPersonIds.map((personId) => ({ kind: "existing" as const, personId })),
        })

        const createdAtDate = effectiveDate < now ? effectiveDate : now
        await db
          .update(autoPolicies)
          .set({ createdAt: createdAtDate, updatedAt: createdAtDate })
          .where(eq(autoPolicies.id, detail.id))

        return {
          id: detail.id,
          effectiveDate: toDateString(effectiveDate),
          expirationDate: toDateString(expirationDate),
          status,
        }
      })
    )
    results.push(...batchResults)
  }

  return results
}
