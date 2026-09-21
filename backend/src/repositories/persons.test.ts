import { eq } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { adminDb, runInOrg } from "../db"
import { organizations, persons } from "../db/schema"
import { createPerson, deletePerson, findPersonById, listPersons, updatePerson } from "./persons"

const testFirstName = "PersonsRepoTest"

let orgId: string

beforeAll(async () => {
  const [org] = await adminDb
    .insert(organizations)
    .values({ name: "Persons Repo Test Org", slug: `persons-repo-test-${Date.now()}` })
    .returning()
  orgId = org.id
})

afterEach(async () => {
  await adminDb.delete(persons).where(eq(persons.firstName, testFirstName))
})

afterAll(async () => {
  await adminDb.delete(organizations).where(eq(organizations.id, orgId))
})

describe("persons repository", () => {
  it("creates and finds a person", async () => {
    await runInOrg(orgId, async () => {
      const created = await createPerson(orgId, {
        firstName: testFirstName,
        lastName: "Create",
        dateOfBirth: "1990-01-01",
        gender: "m",
        relationToInsured: "self",
      })

      const found = await findPersonById(orgId, created.id)
      expect(found?.lastName).toBe("Create")
    })
  })

  it("lists persons including the created one", async () => {
    await runInOrg(orgId, async () => {
      const created = await createPerson(orgId, {
        firstName: testFirstName,
        lastName: "List",
        dateOfBirth: "1990-01-01",
        gender: "f",
        relationToInsured: "self",
      })

      const all = await listPersons(orgId)
      expect(all.some((p) => p.id === created.id)).toBe(true)
    })
  })

  it("updates a person", async () => {
    await runInOrg(orgId, async () => {
      const created = await createPerson(orgId, {
        firstName: testFirstName,
        lastName: "Before",
        dateOfBirth: "1990-01-01",
        gender: "m",
        relationToInsured: "self",
      })

      const updated = await updatePerson(orgId, created.id, { lastName: "After" })
      expect(updated?.lastName).toBe("After")
    })
  })

  it("deletes a person", async () => {
    await runInOrg(orgId, async () => {
      const created = await createPerson(orgId, {
        firstName: testFirstName,
        lastName: "Delete",
        dateOfBirth: "1990-01-01",
        gender: "m",
        relationToInsured: "self",
      })

      const result = await deletePerson(orgId, created.id)
      expect(result).toBe(true)
      expect(await findPersonById(orgId, created.id)).toBeUndefined()
    })
  })
})
