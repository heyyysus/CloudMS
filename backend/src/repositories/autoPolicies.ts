import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { autoPolicies, carriers, clients, drivers, persons, policyDrivers, vehicles } from "../db/schema"
import type { AutoPolicy, DriverRating, NewAutoPolicy, NewPerson, NewVehicle } from "../types"
import { CrossOrgReferenceError } from "./errors"

export async function listAutoPolicies(orgId: string): Promise<AutoPolicy[]> {
  return db.select().from(autoPolicies).where(eq(autoPolicies.orgId, orgId))
}

export async function listAutoPoliciesByClientId(
  orgId: string,
  clientId: string
): Promise<AutoPolicy[]> {
  return db
    .select()
    .from(autoPolicies)
    .where(and(eq(autoPolicies.clientId, clientId), eq(autoPolicies.orgId, orgId)))
}

export async function findAutoPolicyById(
  orgId: string,
  id: string
): Promise<AutoPolicy | undefined> {
  const [row] = await db
    .select()
    .from(autoPolicies)
    .where(and(eq(autoPolicies.id, id), eq(autoPolicies.orgId, orgId)))
  return row
}

export async function getPolicyWithDetails(orgId: string, id: string) {
  return db.query.autoPolicies.findFirst({
    where: and(eq(autoPolicies.id, id), eq(autoPolicies.orgId, orgId)),
    with: {
      client: true,
      carrier: true,
      vehicles: { where: eq(vehicles.orgId, orgId) },
      policyDrivers: {
        where: eq(policyDrivers.orgId, orgId),
        with: { driver: { with: { person: true } } },
      },
    },
  })
}

export async function createAutoPolicy(
  orgId: string,
  input: Omit<NewAutoPolicy, "orgId">
): Promise<AutoPolicy> {
  return db.transaction(async (tx) => {
    await checkClientAndCarrier(tx, orgId, input.clientId, input.carrierId)

    const [row] = await tx
      .insert(autoPolicies)
      .values({ ...input, orgId })
      .returning()
    return row
  })
}

// Validation failures inside the nested create/update transaction that the
// route should surface as a 400 rather than a 500.
export class PolicyWriteError extends Error {}

export type CreatePolicyVehicleInput = Omit<
  NewVehicle,
  "id" | "orgId" | "policyId" | "createdAt" | "updatedAt"
>

export type CreatePolicyDriverInput =
  | {
      kind: "existing"
      personId: string
      dlNumber?: string
      rating?: DriverRating
      sr22?: boolean
    }
  | {
      kind: "new"
      person: Omit<NewPerson, "id" | "orgId" | "createdAt" | "updatedAt">
      dlNumber?: string
      rating: DriverRating
      sr22: boolean
    }

export interface CreatePolicyInput extends Omit<NewAutoPolicy, "orgId"> {
  vehicles?: CreatePolicyVehicleInput[]
  drivers?: CreatePolicyDriverInput[]
}

export interface UpdatePolicyInput extends Partial<Omit<NewAutoPolicy, "orgId">> {
  vehicles?: CreatePolicyVehicleInput[]
  drivers?: CreatePolicyDriverInput[]
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function checkClientAndCarrier(
  tx: Tx,
  orgId: string,
  clientId: string | undefined,
  carrierId: string | undefined
): Promise<void> {
  if (clientId !== undefined) {
    const [client] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.orgId, orgId)))
    if (!client) throw new CrossOrgReferenceError()
  }
  if (carrierId !== undefined) {
    const [carrier] = await tx
      .select({ id: carriers.id })
      .from(carriers)
      .where(and(eq(carriers.id, carrierId), eq(carriers.orgId, orgId)))
    if (!carrier) throw new CrossOrgReferenceError()
  }
}

// Resolves each spec to a drivers.id (creating persons/drivers rows as
// needed), dedupes, and inserts policy_drivers links for policyId. An
// "existing" driver spec reuses the person's drivers row when one exists
// (drivers.personId is unique); otherwise it creates one. dlNumber is
// optional throughout — an agency may not have it yet (e.g. a prospect
// client). Shared by create and update so both stay atomic with the caller's
// transaction.
async function linkPolicyDrivers(
  tx: Tx,
  orgId: string,
  policyId: string,
  specs: CreatePolicyDriverInput[]
): Promise<void> {
  const linkedDriverIds = new Set<string>()
  for (const spec of specs) {
    let driverId: string
    if (spec.kind === "existing") {
      const [person] = await tx
        .select({ id: persons.id })
        .from(persons)
        .where(and(eq(persons.id, spec.personId), eq(persons.orgId, orgId)))
      if (!person) {
        throw new PolicyWriteError(`Person ${spec.personId} not found`)
      }
      const [existingDriver] = await tx
        .select({ id: drivers.id })
        .from(drivers)
        .where(and(eq(drivers.personId, spec.personId), eq(drivers.orgId, orgId)))
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
            orgId,
          })
          .returning({ id: drivers.id })
        driverId = created.id
      }
    } else {
      const [person] = await tx
        .insert(persons)
        .values({ ...spec.person, orgId })
        .returning({ id: persons.id })
      const [created] = await tx
        .insert(drivers)
        .values({
          personId: person.id,
          dlNumber: spec.dlNumber,
          rating: spec.rating,
          sr22: spec.sr22,
          orgId,
        })
        .returning({ id: drivers.id })
      driverId = created.id
    }

    if (!linkedDriverIds.has(driverId)) {
      linkedDriverIds.add(driverId)
      await tx.insert(policyDrivers).values({ policyId, driverId, orgId })
    }
  }
}

// Creates the policy plus its vehicles and drivers in one transaction, so a
// failure anywhere leaves no partial policy behind.
export async function createAutoPolicyWithDetails(orgId: string, input: CreatePolicyInput) {
  const { vehicles: vehicleInputs, drivers: driverInputs, ...policyFields } = input

  const policyId = await db.transaction(async (tx) => {
    await checkClientAndCarrier(tx, orgId, policyFields.clientId, policyFields.carrierId)

    const [policy] = await tx
      .insert(autoPolicies)
      .values({ ...policyFields, orgId })
      .returning()

    if (vehicleInputs && vehicleInputs.length > 0) {
      await tx
        .insert(vehicles)
        .values(vehicleInputs.map((vehicle) => ({ ...vehicle, policyId: policy.id, orgId })))
    }

    await linkPolicyDrivers(tx, orgId, policy.id, driverInputs ?? [])

    return policy.id
  })

  const detail = await getPolicyWithDetails(orgId, policyId)
  if (!detail) throw new Error(`Policy ${policyId} missing after create`)
  return detail
}

export async function updateAutoPolicy(
  orgId: string,
  id: string,
  input: Partial<Omit<NewAutoPolicy, "orgId">>
): Promise<AutoPolicy | undefined> {
  return db.transaction(async (tx) => {
    await checkClientAndCarrier(tx, orgId, input.clientId, input.carrierId)

    const [row] = await tx
      .update(autoPolicies)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(autoPolicies.id, id), eq(autoPolicies.orgId, orgId)))
      .returning()
    return row
  })
}

// Updates the policy row plus (when the keys are present) full-replaces its
// vehicles and policy_drivers links, all in one transaction. `vehicles` /
// `drivers` absent leaves that collection untouched; [] clears it; [...]
// replaces it (vehicle row ids change; removed drivers are unlinked, never
// deleted, since a person/driver may be linked elsewhere). Returns undefined
// when no policy has that id.
export async function updateAutoPolicyWithDetails(
  orgId: string,
  id: string,
  input: UpdatePolicyInput
) {
  const { vehicles: vehicleInputs, drivers: driverInputs, ...policyFields } = input

  const found = await db.transaction(async (tx) => {
    await checkClientAndCarrier(tx, orgId, policyFields.clientId, policyFields.carrierId)

    const [policy] = await tx
      .update(autoPolicies)
      .set({ ...policyFields, updatedAt: new Date() })
      .where(and(eq(autoPolicies.id, id), eq(autoPolicies.orgId, orgId)))
      .returning({ id: autoPolicies.id })
    if (!policy) return false

    if (vehicleInputs !== undefined) {
      await tx
        .delete(vehicles)
        .where(and(eq(vehicles.policyId, id), eq(vehicles.orgId, orgId)))
      if (vehicleInputs.length > 0) {
        await tx
          .insert(vehicles)
          .values(vehicleInputs.map((vehicle) => ({ ...vehicle, policyId: id, orgId })))
      }
    }

    if (driverInputs !== undefined) {
      await tx
        .delete(policyDrivers)
        .where(and(eq(policyDrivers.policyId, id), eq(policyDrivers.orgId, orgId)))
      await linkPolicyDrivers(tx, orgId, id, driverInputs)
    }

    return true
  })

  if (!found) return undefined
  const detail = await getPolicyWithDetails(orgId, id)
  if (!detail) throw new Error(`Policy ${id} missing after update`)
  return detail
}

export async function deleteAutoPolicy(orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(autoPolicies)
    .where(and(eq(autoPolicies.id, id), eq(autoPolicies.orgId, orgId)))
    .returning({ id: autoPolicies.id })
  return deleted.length > 0
}
