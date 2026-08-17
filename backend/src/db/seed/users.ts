import type { User } from "../../types"
import { db } from "../index"
import { users } from "../schema"
import { faker } from "./rng"

const STAFF_COUNT = 5

export async function seedUsers(): Promise<User[]> {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase()
  const usedEmails = new Set<string>(adminEmail ? [adminEmail] : [])

  const staff = Array.from({ length: STAFF_COUNT }, (_, i) => {
    const firstName = faker.person.firstName()
    const lastName = faker.person.lastName()
    let email = faker.internet.email({ firstName, lastName }).toLowerCase()
    while (usedEmails.has(email)) {
      email = faker.internet
        .email({ firstName, lastName, provider: `agency${i}.example.com` })
        .toLowerCase()
    }
    usedEmails.add(email)
    return {
      email,
      name: `${firstName} ${lastName}`,
      role: i < 2 ? ("admin" as const) : ("staff" as const),
    }
  })

  const values = adminEmail
    ? [{ email: adminEmail, name: "Admin", role: "admin" as const }, ...staff]
    : staff

  return db.insert(users).values(values).returning()
}
