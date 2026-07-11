import { eq } from "drizzle-orm"
import { describe, expect, it } from "vitest"
import { db } from "../db"
import { autoPolicies, carriers, clients, drivers, persons } from "../db/schema"
import {
  addDriverToPolicy,
  listDriversForPolicy,
  listPoliciesForDriver,
  removeDriverFromPolicy,
} from "./policyDrivers"

describe("policyDrivers repository", () => {
  it("links and unlinks a driver and a policy", async () => {
    const [carrier] = await db
      .insert(carriers)
      .values({ name: "PolicyDriverRepoTest", naic: "99999" })
      .returning()
    const [person] = await db
      .insert(persons)
      .values({
        firstName: "PolicyDriverRepoTest",
        lastName: "Person",
        dateOfBirth: "1990-01-01",
        gender: "m",
        relationToInsured: "self",
      })
      .returning()
    const [driver] = await db
      .insert(drivers)
      .values({ personId: person.id, dlNumber: "D9999999" })
      .returning()
    const [client] = await db.insert(clients).values({ namedInsuredId: person.id }).returning()
    const [policy] = await db
      .insert(autoPolicies)
      .values({
        clientId: client.id,
        carrierId: carrier.id,
        policyNumber: "POL-REPOTEST-99999",
        effectiveDate: "2026-01-01",
        expirationDate: "2027-01-01",
      })
      .returning()

    try {
      await addDriverToPolicy(policy.id, driver.id)

      const driversForPolicy = await listDriversForPolicy(policy.id)
      expect(driversForPolicy).toHaveLength(1)
      expect(driversForPolicy[0].driver.person.firstName).toBe("PolicyDriverRepoTest")

      const policiesForDriver = await listPoliciesForDriver(driver.id)
      expect(policiesForDriver).toHaveLength(1)
      expect(policiesForDriver[0].policy.id).toBe(policy.id)

      const removed = await removeDriverFromPolicy(policy.id, driver.id)
      expect(removed).toBe(true)
      expect(await listDriversForPolicy(policy.id)).toHaveLength(0)
    } finally {
      await db.delete(autoPolicies).where(eq(autoPolicies.id, policy.id))
      await db.delete(clients).where(eq(clients.id, client.id))
      await db.delete(drivers).where(eq(drivers.id, driver.id))
      await db.delete(persons).where(eq(persons.id, person.id))
      await db.delete(carriers).where(eq(carriers.id, carrier.id))
    }
  })
})
