import { eq } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, drivers, persons, policyDrivers, vehicles } from "../db/schema"
import type { AutoPolicy, DriverRating, NewAutoPolicy, NewPerson, NewVehicle } from "../types"

export async function listAutoPolicies(): Promise<AutoPolicy[]> {
  return db.select().from(autoPolicies)
}

export async function listAutoPoliciesByClientId(clientId: number): Promise<AutoPolicy[]> {
  return db.select().from(autoPolicies).where(eq(autoPolicies.clientId, clientId))
}

export async function findAutoPolicyById(id: number): Promise<AutoPolicy | undefined> {
  const [row] = await db.select().from(autoPolicies).where(eq(autoPolicies.id, id))
  return row
}

export async function getPolicyWithDetails(id: number) {
  return db.query.autoPolicies.findFirst({
    where: eq(autoPolicies.id, id),
    with: {
      client: true,
      carrier: true,
      vehicles: true,
      policyDrivers: { with: { driver: { with: { person: true } } } },
    },
  })
}

export async function createAutoPolicy(input: NewAutoPolicy): Promise<AutoPolicy> {
  const [row] = await db.insert(autoPolicies).values(input).returning()
  return row
}

// Validation failures inside the nested-create transaction that the route
// should surface as a 400 rather than a 500.
export class PolicyCreateError extends Error {}

export type CreatePolicyVehicleInput = Omit<
  NewVehicle,
  "id" | "policyId" | "createdAt" | "updatedAt"
>

export type CreatePolicyDriverInput =
  | {
      kind: "existing"
      personId: number
      dlNumber?: string
      rating?: DriverRating
      sr22?: boolean
    }
  | {
      kind: "new"
      person: Omit<NewPerson, "id" | "createdAt" | "updatedAt">
      dlNumber: string
      rating: DriverRating
      sr22: boolean
    }

export interface CreatePolicyInput extends NewAutoPolicy {
  vehicles?: CreatePolicyVehicleInput[]
  drivers?: CreatePolicyDriverInput[]
}

// Creates the policy plus its vehicles and drivers in one transaction, so a
// failure anywhere leaves no partial policy behind. An "existing" driver spec
// reuses the person's drivers row when one exists (drivers.personId is
// unique); otherwise it creates one, which requires a dlNumber.
export async function createAutoPolicyWithDetails(input: CreatePolicyInput) {
  const { vehicles: vehicleInputs, drivers: driverInputs, ...policyFields } = input

  const policyId = await db.transaction(async (tx) => {
    const [policy] = await tx.insert(autoPolicies).values(policyFields).returning()

    if (vehicleInputs && vehicleInputs.length > 0) {
      await tx
        .insert(vehicles)
        .values(vehicleInputs.map((vehicle) => ({ ...vehicle, policyId: policy.id })))
    }

    const linkedDriverIds = new Set<number>()
    for (const spec of driverInputs ?? []) {
      let driverId: number
      if (spec.kind === "existing") {
        const [person] = await tx
          .select({ id: persons.id })
          .from(persons)
          .where(eq(persons.id, spec.personId))
        if (!person) {
          throw new PolicyCreateError(`Person ${spec.personId} not found`)
        }
        const [existingDriver] = await tx
          .select({ id: drivers.id })
          .from(drivers)
          .where(eq(drivers.personId, spec.personId))
        if (existingDriver) {
          driverId = existingDriver.id
        } else {
          if (!spec.dlNumber) {
            throw new PolicyCreateError(
              `dlNumber is required for person ${spec.personId}, who is not yet a driver`
            )
          }
          const [created] = await tx
            .insert(drivers)
            .values({
              personId: spec.personId,
              dlNumber: spec.dlNumber,
              rating: spec.rating,
              sr22: spec.sr22,
            })
            .returning({ id: drivers.id })
          driverId = created.id
        }
      } else {
        const [person] = await tx.insert(persons).values(spec.person).returning({ id: persons.id })
        const [created] = await tx
          .insert(drivers)
          .values({
            personId: person.id,
            dlNumber: spec.dlNumber,
            rating: spec.rating,
            sr22: spec.sr22,
          })
          .returning({ id: drivers.id })
        driverId = created.id
      }

      if (!linkedDriverIds.has(driverId)) {
        linkedDriverIds.add(driverId)
        await tx.insert(policyDrivers).values({ policyId: policy.id, driverId })
      }
    }

    return policy.id
  })

  const detail = await getPolicyWithDetails(policyId)
  if (!detail) throw new Error(`Policy ${policyId} missing after create`)
  return detail
}

export async function updateAutoPolicy(
  id: number,
  input: Partial<NewAutoPolicy>
): Promise<AutoPolicy | undefined> {
  const [row] = await db
    .update(autoPolicies)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(autoPolicies.id, id))
    .returning()
  return row
}

export async function deleteAutoPolicy(id: number): Promise<boolean> {
  const deleted = await db
    .delete(autoPolicies)
    .where(eq(autoPolicies.id, id))
    .returning({ id: autoPolicies.id })
  return deleted.length > 0
}
