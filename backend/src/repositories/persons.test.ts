import { eq } from "drizzle-orm"
import { afterEach, describe, expect, it } from "vitest"
import { db } from "../db"
import { persons } from "../db/schema"
import { createPerson, deletePerson, findPersonById, listPersons, updatePerson } from "./persons"

const testFirstName = "PersonsRepoTest"

afterEach(async () => {
  await db.delete(persons).where(eq(persons.firstName, testFirstName))
})

describe("persons repository", () => {
  it("creates and finds a person", async () => {
    const created = await createPerson({
      firstName: testFirstName,
      lastName: "Create",
      dateOfBirth: "1990-01-01",
      gender: "m",
      relationToInsured: "self",
    })

    const found = await findPersonById(created.id)
    expect(found?.lastName).toBe("Create")
  })

  it("lists persons including the created one", async () => {
    const created = await createPerson({
      firstName: testFirstName,
      lastName: "List",
      dateOfBirth: "1990-01-01",
      gender: "f",
      relationToInsured: "self",
    })

    const all = await listPersons()
    expect(all.some((p) => p.id === created.id)).toBe(true)
  })

  it("updates a person", async () => {
    const created = await createPerson({
      firstName: testFirstName,
      lastName: "Before",
      dateOfBirth: "1990-01-01",
      gender: "m",
      relationToInsured: "self",
    })

    const updated = await updatePerson(created.id, { lastName: "After" })
    expect(updated?.lastName).toBe("After")
  })

  it("deletes a person", async () => {
    const created = await createPerson({
      firstName: testFirstName,
      lastName: "Delete",
      dateOfBirth: "1990-01-01",
      gender: "m",
      relationToInsured: "self",
    })

    const result = await deletePerson(created.id)
    expect(result).toBe(true)
    expect(await findPersonById(created.id)).toBeUndefined()
  })
})
