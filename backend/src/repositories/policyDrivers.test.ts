import { eq } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { adminDb, db, runInOrg } from "../db"
import { autoPolicies, carriers, clients, drivers, organizations, persons } from "../db/schema"
import {
  addDriverToPolicy,
  listDriversForPolicy,
  listPoliciesForDriver,
  removeDriverFromPolicy,
} from "./policyDrivers"

let orgId: string

beforeAll(async () => {
  const [org] = await adminDb
    .insert(organizations)
    .values({ name: "PolicyDrivers Repo Test Org", slug: `policy-drivers-repo-test-${Date.now()}` })
    .returning()
  orgId = org.id
})

afterAll(async () => {
  await adminDb.delete(organizations).where(eq(organizations.id, orgId))
})

describe("policyDrivers repository", () => {
  it("links and unlinks a driver and a policy", async () => {
    const { carrier, person, driver, client, policy } = await runInOrg(orgId, async () => {
      const [carrier] = await db
        .insert(carriers)
        .values({ name: "PolicyDriverRepoTest", naic: "99999", orgId })
        .returning()
      const [person] = await db
        .insert(persons)
        .values({
          firstName: "PolicyDriverRepoTest",
          lastName: "Person",
          dateOfBirth: "1990-01-01",
          gender: "m",
          relationToInsured: "self",
          orgId,
        })
        .returning()
      const [driver] = await db
        .insert(drivers)
        .values({ personId: person.id, dlNumber: "D9999999", orgId })
        .returning()
      const [client] = await db
        .insert(clients)
        .values({ namedInsuredId: person.id, orgId })
        .returning()
      const [policy] = await db
        .insert(autoPolicies)
        .values({
          clientId: client.id,
          carrierId: carrier.id,
          policyNumber: "POL-REPOTEST-99999",
          effectiveDate: "2026-01-01",
          expirationDate: "2027-01-01",
          orgId,
        })
        .returning()
      return { carrier, person, driver, client, policy }
    })

    try {
      await runInOrg(orgId, () => addDriverToPolicy(orgId, policy.id, driver.id))

      const driversForPolicy = await runInOrg(orgId, () => listDriversForPolicy(orgId, policy.id))
      expect(driversForPolicy).toHaveLength(1)
      expect(driversForPolicy[0].driver.person.firstName).toBe("PolicyDriverRepoTest")

      const policiesForDriver = await runInOrg(orgId, () => listPoliciesForDriver(orgId, driver.id))
      expect(policiesForDriver).toHaveLength(1)
      expect(policiesForDriver[0].policy.id).toBe(policy.id)

      const removed = await runInOrg(orgId, () => removeDriverFromPolicy(orgId, policy.id, driver.id))
      expect(removed).toBe(true)
      expect(await runInOrg(orgId, () => listDriversForPolicy(orgId, policy.id))).toHaveLength(0)
    } finally {
      await adminDb.delete(autoPolicies).where(eq(autoPolicies.id, policy.id))
      await adminDb.delete(clients).where(eq(clients.id, client.id))
      await adminDb.delete(drivers).where(eq(drivers.id, driver.id))
      await adminDb.delete(persons).where(eq(persons.id, person.id))
      await adminDb.delete(carriers).where(eq(carriers.id, carrier.id))
    }
  })
})
