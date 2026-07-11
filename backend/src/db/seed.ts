import "dotenv/config"
import { eq } from "drizzle-orm"
import { db } from "./index"
import {
  autoPolicies,
  carriers,
  clientEmails,
  clientPhones,
  clients,
  drivers,
  persons,
  policyDrivers,
  vehicles,
} from "./schema"

async function main() {
  await db.delete(policyDrivers)
  await db.delete(vehicles)
  await db.delete(autoPolicies)
  await db.delete(clientPhones)
  await db.delete(clientEmails)
  await db.delete(clients)
  await db.delete(drivers)
  await db.delete(persons)
  await db.delete(carriers)

  const [carrier] = await db
    .insert(carriers)
    .values({ name: "Progressive", naic: "24260" })
    .returning()

  const [johnPerson] = await db
    .insert(persons)
    .values({
      firstName: "John",
      lastName: "Doe",
      dateOfBirth: "1985-03-14",
      maritalStatus: "married",
      gender: "m",
      relationToInsured: "self",
    })
    .returning()

  const [janePerson] = await db
    .insert(persons)
    .values({
      firstName: "Jane",
      lastName: "Doe",
      dateOfBirth: "1987-07-22",
      maritalStatus: "married",
      gender: "f",
      relationToInsured: "spouse",
    })
    .returning()

  const [childPerson] = await db
    .insert(persons)
    .values({
      firstName: "Jack",
      lastName: "Doe",
      dateOfBirth: "2008-11-02",
      maritalStatus: "single",
      gender: "m",
      relationToInsured: "child",
    })
    .returning()

  const [johnDriver] = await db
    .insert(drivers)
    .values({ personId: johnPerson.id, dlNumber: "D1234567", rating: "rated", sr22: false })
    .returning()

  const [janeDriver] = await db
    .insert(drivers)
    .values({ personId: janePerson.id, dlNumber: "D7654321", rating: "rated", sr22: false })
    .returning()

  const [childDriver] = await db
    .insert(drivers)
    .values({ personId: childPerson.id, dlNumber: "D1122334", rating: "rated", sr22: false })
    .returning()

  const [client] = await db
    .insert(clients)
    .values({
      namedInsuredId: johnPerson.id,
      secondNamedInsuredId: janePerson.id,
      mailingAddress: "123 Main St, Springfield, IL 62701",
      physicalAddress: "123 Main St, Springfield, IL 62701",
    })
    .returning()

  await db.insert(clientPhones).values({ clientId: client.id, phoneNumber: "555-123-4567" })
  await db.insert(clientEmails).values({ clientId: client.id, email: "john.doe@example.com" })

  const [policy] = await db
    .insert(autoPolicies)
    .values({
      clientId: client.id,
      carrierId: carrier.id,
      policyNumber: "POL-000123",
      policyAddress: "123 Main St, Springfield, IL 62701",
      effectiveDate: "2026-07-10",
      expirationDate: "2027-01-10",
      status: "active",
    })
    .returning()

  await db.insert(policyDrivers).values([
    { policyId: policy.id, driverId: johnDriver.id },
    { policyId: policy.id, driverId: janeDriver.id },
    { policyId: policy.id, driverId: childDriver.id },
  ])

  const sharedCoverage = {
    coverageBi: "100/300",
    coveragePd: "100",
    coverageUmbi: "100/300",
    coverageMedpay: "5000",
  }

  await db.insert(vehicles).values([
    {
      policyId: policy.id,
      vin: "1HGCM82633A123456",
      make: "Honda",
      model: "Civic",
      year: 2015,
      garagingZip: "62701",
      ...sharedCoverage,
      coverageComp: "1000",
      coverageColl: "1000",
    },
    {
      policyId: policy.id,
      vin: "4T1G11AK5RU123456",
      make: "Toyota",
      model: "Camry",
      year: 2024,
      garagingZip: "62701",
      ...sharedCoverage,
      coverageComp: "1000",
      coverageColl: "1000",
    },
  ])

  console.log("\n=== Client ===")
  console.log(await db.select().from(clients).where(eq(clients.id, client.id)))

  console.log("\n=== Persons (named insureds + child) ===")
  console.log(await db.select().from(persons))

  console.log("\n=== Policy ===")
  console.log(await db.select().from(autoPolicies).where(eq(autoPolicies.id, policy.id)))

  console.log("\n=== Vehicles ===")
  console.log(await db.select().from(vehicles).where(eq(vehicles.policyId, policy.id)))

  console.log("\n=== Policy Drivers (joined with driver + person) ===")
  const policyDriverRows = await db
    .select({
      driverId: drivers.id,
      firstName: persons.firstName,
      lastName: persons.lastName,
      relationToInsured: persons.relationToInsured,
      dlNumber: drivers.dlNumber,
      rating: drivers.rating,
    })
    .from(policyDrivers)
    .innerJoin(drivers, eq(policyDrivers.driverId, drivers.id))
    .innerJoin(persons, eq(drivers.personId, persons.id))
    .where(eq(policyDrivers.policyId, policy.id))
  console.log(policyDriverRows)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
