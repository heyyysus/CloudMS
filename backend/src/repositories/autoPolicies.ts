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

// Validation failures inside the nested create/update transaction that the
// route should surface as a 400 rather than a 500.
export class PolicyWriteError extends Error {}

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
      dlNumber?: string
      rating: DriverRating
      sr22: boolean
    }

export interface CreatePolicyInput extends NewAutoPolicy {
  vehicles?: CreatePolicyVehicleInput[]
  drivers?: CreatePolicyDriverInput[]
}

export interface UpdatePolicyInput extends Partial<NewAutoPolicy> {
  vehicles?: CreatePolicyVehicleInput[]
  drivers?: CreatePolicyDriverInput[]
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

// Resolves each spec to a drivers.id (creating persons/drivers rows as
// needed), dedupes, and inserts policy_drivers links for policyId. An
// "existing" driver spec reuses the person's drivers row when one exists
// (drivers.personId is unique); otherwise it creates one. dlNumber is
// optional throughout — an agency may not have it yet (e.g. a prospect
// client). Shared by create and update so both stay atomic with the caller's
// transaction.
async function linkPolicyDrivers(
  tx: Tx,
  policyId: number,
  specs: CreatePolicyDriverInput[]
): Promise<void> {
  const linkedDriverIds = new Set<number>()
  for (const spec of specs) {
    let driverId: number
    if (spec.kind === "existing") {
      const [person] = await tx
        .select({ id: persons.id })
        .from(persons)
        .where(eq(persons.id, spec.personId))
      if (!person) {
        throw new PolicyWriteError(`Person ${spec.personId} not found`)
      }
      const [existingDriver] = await tx
        .select({ id: drivers.id })
        .from(drivers)
        .where(eq(drivers.personId, spec.personId))
      if (existingDriver) {
        driverId = existingDriver.id
      } else {
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
      await tx.insert(policyDrivers).values({ policyId, driverId })
    }
  }
}

// Creates the policy plus its vehicles and drivers in one transaction, so a
// failure anywhere leaves no partial policy behind.
export async function createAutoPolicyWithDetails(input: CreatePolicyInput) {
  const { vehicles: vehicleInputs, drivers: driverInputs, ...policyFields } = input

  const policyId = await db.transaction(async (tx) => {
    const [policy] = await tx.insert(autoPolicies).values(policyFields).returning()

    if (vehicleInputs && vehicleInputs.length > 0) {
      await tx
        .insert(vehicles)
        .values(vehicleInputs.map((vehicle) => ({ ...vehicle, policyId: policy.id })))
    }

    await linkPolicyDrivers(tx, policy.id, driverInputs ?? [])

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

// Updates the policy row plus (when the keys are present) full-replaces its
// vehicles and policy_drivers links, all in one transaction. `vehicles` /
// `drivers` absent leaves that collection untouched; [] clears it; [...]
// replaces it (vehicle row ids change; removed drivers are unlinked, never
// deleted, since a person/driver may be linked elsewhere). Returns undefined
// when no policy has that id.
export async function updateAutoPolicyWithDetails(id: number, input: UpdatePolicyInput) {
  const { vehicles: vehicleInputs, drivers: driverInputs, ...policyFields } = input

  const found = await db.transaction(async (tx) => {
    const [policy] = await tx
      .update(autoPolicies)
      .set({ ...policyFields, updatedAt: new Date() })
      .where(eq(autoPolicies.id, id))
      .returning({ id: autoPolicies.id })
    if (!policy) return false

    if (vehicleInputs !== undefined) {
      await tx.delete(vehicles).where(eq(vehicles.policyId, id))
      if (vehicleInputs.length > 0) {
        await tx
          .insert(vehicles)
          .values(vehicleInputs.map((vehicle) => ({ ...vehicle, policyId: id })))
      }
    }

    if (driverInputs !== undefined) {
      await tx.delete(policyDrivers).where(eq(policyDrivers.policyId, id))
      await linkPolicyDrivers(tx, id, driverInputs)
    }

    return true
  })

  if (!found) return undefined
  const detail = await getPolicyWithDetails(id)
  if (!detail) throw new Error(`Policy ${id} missing after update`)
  return detail
}

export async function deleteAutoPolicy(id: number): Promise<boolean> {
  const deleted = await db
    .delete(autoPolicies)
    .where(eq(autoPolicies.id, id))
    .returning({ id: autoPolicies.id })
  return deleted.length > 0
}
