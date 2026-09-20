import type { Carrier } from "../../types"
import { adminDb as db } from "../index"
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

export const CARRIER_COUNT = 8
export const SECOND_ORG_CARRIER_COUNT = 2

// usedNaics is shared across both orgs' calls since carriers.naic stays
// globally unique in this sub-issue.
export async function seedCarriers(
  orgId: number,
  count: number,
  usedNaics: Set<string>
): Promise<Carrier[]> {
  const names = faker.helpers.arrayElements(CARRIER_NAMES, count)

  const values = names.map((name) => {
    let naic = faker.string.numeric(5)
    while (usedNaics.has(naic)) naic = faker.string.numeric(5)
    usedNaics.add(naic)
    const slug = name.split(" ")[0].toLowerCase()
    return {
      orgId,
      name,
      naic,
      phone: `${faker.string.numeric(3)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
      email: `claims@${slug}.example.com`,
      website: `https://www.${slug}.example.com`,
    }
  })

  return db.insert(carriers).values(values).returning()
}
