import { eq, inArray, like } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { db } from "../db"
import { autoPolicies, carriers, clients, drivers, persons } from "../db/schema"
import type { Carrier, Client, Person } from "../types"
import {
  createAutoPolicyWithDetails,
  PolicyWriteError,
  updateAutoPolicyWithDetails,
} from "./autoPolicies"

const PERSON_PREFIX = "AutoPolicyRepoTest"
const POLICY_PREFIX = "POL-APRT-"

function personValues(firstName: string) {
  return {
    firstName,
    lastName: PERSON_PREFIX,
    dateOfBirth: "1990-01-01",
    gender: "m",
    relationToInsured: "self",
  } as const
}

function policyValues(carrierId: number, clientId: number, suffix: string) {
  return {
    clientId,
    carrierId,
    policyNumber: `${POLICY_PREFIX}${suffix}`,
    effectiveDate: "2026-01-01",
    expirationDate: "2026-07-01",
  }
}

function vehicleValues(vin: string) {
  return { vin, make: "Toyota", model: "Camry", year: 2020, garagingZip: "90001" }
}

let carrier: Carrier
let insured: Person
let client: Client

beforeAll(async () => {
  ;[carrier] = await db.insert(carriers).values({ name: PERSON_PREFIX, naic: "99901" }).returning()
  ;[insured] = await db.insert(persons).values(personValues("Insured")).returning()
  ;[client] = await db.insert(clients).values({ namedInsuredId: insured.id }).returning()
})

afterAll(async () => {
  // Policies cascade-delete their vehicles and policy_drivers; persons
  // cascade-delete their drivers rows.
  await db.delete(autoPolicies).where(like(autoPolicies.policyNumber, `${POLICY_PREFIX}%`))
  await db.delete(clients).where(eq(clients.id, client.id))
  await db.delete(persons).where(like(persons.lastName, PERSON_PREFIX))
  await db.delete(carriers).where(eq(carriers.id, carrier.id))
})

describe("createAutoPolicyWithDetails", () => {
  it("creates a policy with vehicles and drivers atomically", async () => {
    const detail = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "FULL"),
      vehicles: [
        { ...vehicleValues("APRTVIN0000000001"), coverageBi: "100/300" },
        vehicleValues("APRTVIN0000000002"),
      ],
      drivers: [
        { kind: "existing", personId: insured.id, dlNumber: "D-APRT-1" },
        {
          kind: "new",
          person: personValues("NewDriver"),
          dlNumber: "D-APRT-2",
          rating: "excluded",
          sr22: true,
        },
      ],
    })

    expect(detail.policyNumber).toBe(`${POLICY_PREFIX}FULL`)
    expect(detail.carrier.id).toBe(carrier.id)
    expect(detail.vehicles).toHaveLength(2)
    expect(detail.vehicles.find((v) => v.vin === "APRTVIN0000000001")?.coverageBi).toBe("100/300")
    expect(detail.policyDrivers).toHaveLength(2)

    const insuredDriver = detail.policyDrivers.find((pd) => pd.driver.personId === insured.id)
    expect(insuredDriver?.driver.dlNumber).toBe("D-APRT-1")
    expect(insuredDriver?.driver.rating).toBe("rated")

    const newDriver = detail.policyDrivers.find((pd) => pd.driver.personId !== insured.id)
    expect(newDriver?.driver.person.firstName).toBe("NewDriver")
    expect(newDriver?.driver.rating).toBe("excluded")
    expect(newDriver?.driver.sr22).toBe(true)
  })

  it("reuses an existing drivers row and ignores submitted overrides", async () => {
    const [person] = await db.insert(persons).values(personValues("HasDriverRow")).returning()
    const [existingDriver] = await db
      .insert(drivers)
      .values({ personId: person.id, dlNumber: "D-APRT-ORIG", sr22: true })
      .returning()

    const detail = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "REUSE"),
      drivers: [{ kind: "existing", personId: person.id, dlNumber: "D-APRT-IGNORED" }],
    })

    expect(detail.policyDrivers).toHaveLength(1)
    expect(detail.policyDrivers[0].driver.id).toBe(existingDriver.id)
    expect(detail.policyDrivers[0].driver.dlNumber).toBe("D-APRT-ORIG")
    expect(detail.policyDrivers[0].driver.sr22).toBe(true)
  })

  it("creates a drivers row without a dlNumber for a person that has none yet", async () => {
    const [person] = await db.insert(persons).values(personValues("NoDriverRow")).returning()

    const detail = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "NODL"),
      drivers: [{ kind: "existing", personId: person.id }],
    })

    expect(detail.policyDrivers).toHaveLength(1)
    expect(detail.policyDrivers[0].driver.dlNumber).toBeNull()
  })

  it("rejects an existing driver spec for a person that does not exist", async () => {
    await expect(
      createAutoPolicyWithDetails({
        ...policyValues(carrier.id, client.id, "NOPERSON"),
        drivers: [{ kind: "existing", personId: 999999999, dlNumber: "D-APRT-X" }],
      })
    ).rejects.toThrow(PolicyWriteError)
  })

  it("rolls back the whole create when the policy number is taken", async () => {
    await createAutoPolicyWithDetails(policyValues(carrier.id, client.id, "TAKEN"))

    await expect(
      createAutoPolicyWithDetails({
        ...policyValues(carrier.id, client.id, "TAKEN"),
        vehicles: [vehicleValues("APRTVIN0000000009")],
        drivers: [
          {
            kind: "new",
            person: personValues("RolledBack"),
            dlNumber: "D-APRT-RB",
            rating: "rated",
            sr22: false,
          },
        ],
      })
    ).rejects.toThrow()

    const orphanedPersons = await db
      .select()
      .from(persons)
      .where(eq(persons.firstName, "RolledBack"))
    expect(orphanedPersons).toHaveLength(0)
  })

  it("allows the same VIN on different policies but not twice on one policy", async () => {
    const vin = "APRTVIN0000000042"

    const first = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "VIN1"),
      vehicles: [vehicleValues(vin)],
    })
    const second = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "VIN2"),
      vehicles: [vehicleValues(vin)],
    })
    expect(first.vehicles[0].vin).toBe(vin)
    expect(second.vehicles[0].vin).toBe(vin)

    await expect(
      createAutoPolicyWithDetails({
        ...policyValues(carrier.id, client.id, "VIN3"),
        vehicles: [vehicleValues(vin), vehicleValues(vin)],
      })
    ).rejects.toThrow()

    const orphaned = await db
      .select({ id: autoPolicies.id })
      .from(autoPolicies)
      .where(inArray(autoPolicies.policyNumber, [`${POLICY_PREFIX}VIN3`]))
    expect(orphaned).toHaveLength(0)
  })
})

describe("updateAutoPolicyWithDetails", () => {
  it("fully replaces vehicles and drivers, unlinking (not deleting) removed drivers", async () => {
    const [keptPerson] = await db.insert(persons).values(personValues("UpdKeep")).returning()
    const original = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "UPD-FULL"),
      vehicles: [vehicleValues("APRTVIN0000000101")],
      drivers: [{ kind: "existing", personId: keptPerson.id, dlNumber: "D-APRT-UPD1" }],
    })
    const removedDriverId = original.policyDrivers[0].driver.id

    const updated = await updateAutoPolicyWithDetails(original.id, {
      vehicles: [vehicleValues("APRTVIN0000000102")],
      drivers: [
        {
          kind: "new",
          person: personValues("UpdNew"),
          dlNumber: "D-APRT-UPD2",
          rating: "rated",
          sr22: false,
        },
      ],
    })

    expect(updated?.vehicles).toHaveLength(1)
    expect(updated?.vehicles[0].vin).toBe("APRTVIN0000000102")
    expect(updated?.policyDrivers).toHaveLength(1)
    expect(updated?.policyDrivers[0].driver.person.firstName).toBe("UpdNew")

    // The removed driver's underlying drivers/persons rows must survive.
    const [survivingDriver] = await db.select().from(drivers).where(eq(drivers.id, removedDriverId))
    expect(survivingDriver).toBeDefined()
    const [survivingPerson] = await db.select().from(persons).where(eq(persons.id, keptPerson.id))
    expect(survivingPerson).toBeDefined()
  })

  it("leaves vehicles and drivers untouched when their keys are omitted", async () => {
    const original = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "UPD-OMIT"),
      vehicles: [vehicleValues("APRTVIN0000000201")],
    })
    const vehicleId = original.vehicles[0].id

    const updated = await updateAutoPolicyWithDetails(original.id, { status: "active" })

    expect(updated?.status).toBe("active")
    expect(updated?.vehicles).toHaveLength(1)
    expect(updated?.vehicles[0].id).toBe(vehicleId)
  })

  it("clears vehicles and drivers when given an empty array", async () => {
    const [person] = await db.insert(persons).values(personValues("UpdClear")).returning()
    const original = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "UPD-CLEAR"),
      vehicles: [vehicleValues("APRTVIN0000000301")],
      drivers: [{ kind: "existing", personId: person.id, dlNumber: "D-APRT-CLR" }],
    })

    const updated = await updateAutoPolicyWithDetails(original.id, { vehicles: [], drivers: [] })

    expect(updated?.vehicles).toHaveLength(0)
    expect(updated?.policyDrivers).toHaveLength(0)

    const [survivingPerson] = await db.select().from(persons).where(eq(persons.id, person.id))
    expect(survivingPerson).toBeDefined()
  })

  it("rolls back the whole update when a driver spec is invalid", async () => {
    const original = await createAutoPolicyWithDetails({
      ...policyValues(carrier.id, client.id, "UPD-RB"),
      vehicles: [vehicleValues("APRTVIN0000000401")],
    })

    await expect(
      updateAutoPolicyWithDetails(original.id, {
        vehicles: [vehicleValues("APRTVIN0000000402")],
        drivers: [{ kind: "existing", personId: 999999999, dlNumber: "D-APRT-X" }],
      })
    ).rejects.toThrow(PolicyWriteError)

    const detail = await updateAutoPolicyWithDetails(original.id, {})
    expect(detail?.vehicles).toHaveLength(1)
    expect(detail?.vehicles[0].vin).toBe("APRTVIN0000000401")
    expect(detail?.policyDrivers).toHaveLength(0)
  })

  it("returns undefined for an unknown policy id", async () => {
    const result = await updateAutoPolicyWithDetails(999999999, { status: "active" })
    expect(result).toBeUndefined()
  })
})
