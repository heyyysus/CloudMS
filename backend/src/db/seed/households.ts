import type { Client, Gender, NewPerson } from "../../types"
import { db } from "../index"
import { clientEmails, clientPhones, clients, drivers, persons } from "../schema"
import { chunk, faker, toDateString } from "./rng"

export interface Household {
  client: Client
  // Person ids of every household member old enough to plausibly drive.
  driverPersonIds: number[]
  zip: string
}

interface Address {
  address1: string
  city: string
  state: string
  zip: string
}

interface Draft {
  personSpecs: NewPerson[]
  namedIdx: number
  secondIdx: number | null
  driverIdxs: number[]
  mailing: Address
  physical: Address
  phone: string
  email: string
}

function phoneNumber(): string {
  return `${faker.string.numeric(3)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`
}

function sexFor(gender: Gender): "male" | "female" | undefined {
  return gender === "m" ? "male" : gender === "f" ? "female" : undefined
}

function pickGender(): Gender {
  return faker.helpers.weightedArrayElement([
    { value: "m" as const, weight: 48 },
    { value: "f" as const, weight: 48 },
    { value: "other" as const, weight: 4 },
  ])
}

function adultBirthdate(): Date {
  return faker.date.birthdate({ min: 25, max: 75, mode: "age" })
}

function childBirthdate(): Date {
  return faker.date.birthdate({ min: 1, max: 25, mode: "age" })
}

function isOldEnoughToDrive(dateOfBirth: Date): boolean {
  const ageYears = (Date.now() - dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  return ageYears >= 15
}

function randomAddress(): Address {
  return {
    address1: faker.location.streetAddress(),
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode("#####"),
  }
}

function buildDraft(): Draft {
  const shape = faker.helpers.weightedArrayElement([
    { value: "single" as const, weight: 40 },
    { value: "couple" as const, weight: 40 },
    { value: "family" as const, weight: 20 },
  ])

  const lastName = faker.person.lastName()
  const personSpecs: NewPerson[] = []
  const driverIdxs: number[] = []

  const namedGender = pickGender()
  const namedFirstName = faker.person.firstName(sexFor(namedGender))
  personSpecs.push({
    firstName: namedFirstName,
    lastName,
    dateOfBirth: toDateString(adultBirthdate()),
    maritalStatus: shape === "single" ? "single" : "married",
    gender: namedGender,
    relationToInsured: "self",
  })
  const namedIdx = 0
  driverIdxs.push(namedIdx)

  let secondIdx: number | null = null
  if (shape !== "single") {
    const spouseGender = namedGender === "m" ? "f" : namedGender === "f" ? "m" : pickGender()
    personSpecs.push({
      firstName: faker.person.firstName(sexFor(spouseGender)),
      lastName,
      dateOfBirth: toDateString(adultBirthdate()),
      maritalStatus: "married",
      gender: spouseGender,
      relationToInsured: "spouse",
    })
    secondIdx = personSpecs.length - 1
    driverIdxs.push(secondIdx)
  }

  if (shape === "family") {
    const childCount = faker.helpers.weightedArrayElement([
      { value: 1, weight: 60 },
      { value: 2, weight: 40 },
    ])
    for (let i = 0; i < childCount; i++) {
      const childGender = pickGender()
      const dob = childBirthdate()
      personSpecs.push({
        firstName: faker.person.firstName(sexFor(childGender)),
        lastName,
        dateOfBirth: toDateString(dob),
        maritalStatus: "single",
        gender: childGender,
        relationToInsured: "child",
      })
      if (isOldEnoughToDrive(dob)) driverIdxs.push(personSpecs.length - 1)
    }
  }

  const mailing = randomAddress()
  const physical = faker.datatype.boolean({ probability: 0.8 }) ? mailing : randomAddress()

  return {
    personSpecs,
    namedIdx,
    secondIdx,
    driverIdxs,
    mailing,
    physical,
    phone: phoneNumber(),
    email: faker.internet.email({ firstName: namedFirstName, lastName }).toLowerCase(),
  }
}

export async function seedHouseholds(count: number): Promise<Household[]> {
  const drafts = Array.from({ length: count }, buildDraft)

  const allPersonSpecs = drafts.flatMap((d) => d.personSpecs)
  const insertedPersons = (
    await Promise.all(
      chunk(allPersonSpecs, 250).map((rows) => db.insert(persons).values(rows).returning())
    )
  ).flat()

  let cursor = 0
  const personRanges = drafts.map((d) => {
    const start = cursor
    cursor += d.personSpecs.length
    return start
  })

  const driverSpecs = drafts.flatMap((d, i) => {
    const start = personRanges[i]
    return d.driverIdxs.map((idx) => ({
      personId: insertedPersons[start + idx].id,
      dlNumber: `${faker.string.alpha({ length: 1, casing: "upper" })}${faker.string.numeric(7)}`,
      rating: faker.helpers.weightedArrayElement([
        { value: "rated" as const, weight: 92 },
        { value: "excluded" as const, weight: 8 },
      ]),
      sr22: faker.datatype.boolean({ probability: 0.05 }),
    }))
  })

  if (driverSpecs.length > 0) {
    await Promise.all(chunk(driverSpecs, 250).map((rows) => db.insert(drivers).values(rows)))
  }

  const clientValues = drafts.map((d, i) => {
    const start = personRanges[i]
    return {
      namedInsuredId: insertedPersons[start + d.namedIdx].id,
      secondNamedInsuredId: d.secondIdx !== null ? insertedPersons[start + d.secondIdx].id : null,
      mailingAddress1: d.mailing.address1,
      mailingCity: d.mailing.city,
      mailingState: d.mailing.state,
      mailingZip: d.mailing.zip,
      physicalAddress1: d.physical.address1,
      physicalCity: d.physical.city,
      physicalState: d.physical.state,
      physicalZip: d.physical.zip,
    }
  })

  const insertedClients = (
    await Promise.all(
      chunk(clientValues, 250).map((rows) => db.insert(clients).values(rows).returning())
    )
  ).flat()

  const phoneValues = drafts.map((d, i) => ({
    clientId: insertedClients[i].id,
    phoneNumber: d.phone,
  }))
  const emailValues = drafts.map((d, i) => ({
    clientId: insertedClients[i].id,
    email: d.email,
  }))

  await Promise.all(chunk(phoneValues, 250).map((rows) => db.insert(clientPhones).values(rows)))
  await Promise.all(chunk(emailValues, 250).map((rows) => db.insert(clientEmails).values(rows)))

  return drafts.map((d, i) => {
    const start = personRanges[i]
    return {
      client: insertedClients[i],
      driverPersonIds: d.driverIdxs.map((idx) => insertedPersons[start + idx].id),
      zip: d.mailing.zip,
    }
  })
}
