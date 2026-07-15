// Shared fixtures for route integration tests. Not a *.test.ts file, so
// vitest's `src/**/*.test.ts` include pattern skips it.
import { randomInt } from "crypto"
import { inArray } from "drizzle-orm"
import { generateSessionToken, hashToken } from "../auth/tokens"
import { db } from "../db"
import { autoPolicies, carriers, clients, persons, users, vehicles } from "../db/schema"
import {
  createAutoPolicy,
  createCarrier,
  createClient,
  createPerson,
  createSession,
  createUser,
  createVehicle,
} from "../repositories"
import type {
  NewAutoPolicy,
  NewCarrier,
  NewClient,
  NewPerson,
  NewVehicle,
  User,
  UserRole,
} from "../types"

// Vitest runs each test file in its own worker/module instance, so a
// per-module counter starting at 0 would collide across files running in
// parallel. Random digits avoid needing any cross-file coordination.
function randomDigits(length: number): string {
  let digits = ""
  for (let i = 0; i < length; i++) digits += randomInt(0, 10).toString()
  return digits
}

function unique(prefix: string): string {
  return `${prefix}${Date.now()}${randomDigits(6)}`
}

// naic/vin have tight length limits (10/17 chars), so these are built from
// digits directly rather than truncating a longer unique string, which would
// risk cutting off the random suffix and colliding.
function uniqueNaic(): string {
  return randomDigits(10)
}

function uniqueVin(): string {
  return randomDigits(17)
}

export async function makeTestUser(prefix: string, role: UserRole = "staff"): Promise<User> {
  return createUser({ email: `${unique(prefix)}@example.com`, role })
}

export async function makeSessionCookie(userId: number): Promise<string> {
  const token = generateSessionToken()
  await createSession({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  return `session=${token}`
}

// Tracks fixture ids created during a test file so afterEach can clean them
// up in FK-safe order, since most of these tables have no single column
// (like `users.email`) that a LIKE-prefix cleanup could key off of.
export class TestContext {
  private userIds: number[] = []
  private personIds: number[] = []
  private clientIds: number[] = []
  private carrierIds: number[] = []
  private policyIds: number[] = []
  private vehicleIds: number[] = []

  async user(prefix: string, role: UserRole = "staff") {
    const u = await makeTestUser(prefix, role)
    this.userIds.push(u.id)
    return u
  }

  async person(overrides: Partial<NewPerson> = {}) {
    const p = await createPerson({
      firstName: unique("First"),
      lastName: "Test",
      dateOfBirth: "1990-01-01",
      gender: "m",
      relationToInsured: "self",
      ...overrides,
    })
    this.personIds.push(p.id)
    return p
  }

  async client(overrides: Partial<NewClient> = {}) {
    const namedInsuredId = overrides.namedInsuredId ?? (await this.person()).id
    const c = await createClient({
      mailingAddress1: "1 Test St",
      physicalAddress1: "1 Test St",
      ...overrides,
      namedInsuredId,
    })
    this.clientIds.push(c.id)
    return c
  }

  async carrier(overrides: Partial<NewCarrier> = {}) {
    const c = await createCarrier({ name: "Test Carrier", naic: uniqueNaic(), ...overrides })
    this.carrierIds.push(c.id)
    return c
  }

  async policy(overrides: Partial<NewAutoPolicy> = {}) {
    const clientId = overrides.clientId ?? (await this.client()).id
    const carrierId = overrides.carrierId ?? (await this.carrier()).id
    const p = await createAutoPolicy({
      policyNumber: unique("POL"),
      effectiveDate: "2026-01-01",
      expirationDate: "2027-01-01",
      ...overrides,
      clientId,
      carrierId,
    })
    this.policyIds.push(p.id)
    return p
  }

  async vehicle(overrides: Partial<NewVehicle> = {}) {
    const policyId = overrides.policyId ?? (await this.policy()).id
    const v = await createVehicle({
      vin: uniqueVin(),
      make: "Honda",
      model: "Civic",
      year: 2020,
      garagingZip: "12345",
      ...overrides,
      policyId,
    })
    this.vehicleIds.push(v.id)
    return v
  }

  // Registers a row created some other way (e.g. through an API call under
  // test rather than via this context's own builders) so cleanup still
  // removes it.
  track(kind: "person" | "client" | "carrier" | "policy" | "vehicle", id: number) {
    switch (kind) {
      case "person":
        this.personIds.push(id)
        break
      case "client":
        this.clientIds.push(id)
        break
      case "carrier":
        this.carrierIds.push(id)
        break
      case "policy":
        this.policyIds.push(id)
        break
      case "vehicle":
        this.vehicleIds.push(id)
        break
    }
  }

  async cleanup() {
    if (this.vehicleIds.length)
      await db.delete(vehicles).where(inArray(vehicles.id, this.vehicleIds))
    if (this.policyIds.length)
      await db.delete(autoPolicies).where(inArray(autoPolicies.id, this.policyIds))
    if (this.clientIds.length) await db.delete(clients).where(inArray(clients.id, this.clientIds))
    if (this.personIds.length) await db.delete(persons).where(inArray(persons.id, this.personIds))
    if (this.carrierIds.length)
      await db.delete(carriers).where(inArray(carriers.id, this.carrierIds))
    if (this.userIds.length) await db.delete(users).where(inArray(users.id, this.userIds))
  }
}
