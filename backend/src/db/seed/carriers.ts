import type { Carrier } from "../../types"
import { db } from "../index"
import { carriers } from "../schema"
import { faker } from "./rng"

const CARRIER_NAMES = [
  "Palomar Mutual Insurance",
  "Beacon Hill Casualty",
  "Redwood State Auto",
  "Granite Peak Insurance Group",
  "Coastal Assurance Co.",
  "Liberty Crossroads Insurance",
  "Summit National Auto Insurance",
  "Harborview Mutual",
  "Prairie States Insurance",
  "Cascade Auto Assurance",
  "Ironwood Casualty Group",
  "Bluepoint Insurance Partners",
]

const CARRIER_COUNT = 8

export async function seedCarriers(): Promise<Carrier[]> {
  const names = faker.helpers.arrayElements(CARRIER_NAMES, CARRIER_COUNT)
  const naics = new Set<string>()

  const values = names.map((name) => {
    let naic = faker.string.numeric(5)
    while (naics.has(naic)) naic = faker.string.numeric(5)
    naics.add(naic)
    const slug = name.split(" ")[0].toLowerCase()
    return {
      name,
      naic,
      phone: `${faker.string.numeric(3)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
      email: `claims@${slug}.example.com`,
      website: `https://www.${slug}.example.com`,
    }
  })

  return db.insert(carriers).values(values).returning()
}
