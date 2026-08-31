import { faker } from "@faker-js/faker"

// Fixed seed so re-running `npm run db:seed` produces the same demo data
// (reproducible for screenshots/QA rather than different every run).
faker.seed(42)

export { faker }

// Re-applies the fixed seed. Faker's generator is a stream that only resets
// on an explicit reseed, so a second seed() call in the same process (the
// demo reseed job) would otherwise continue the stream and produce different
// data each cycle instead of the same reproducible dataset every time.
export function resetRng(): void {
  faker.seed(42)
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}
