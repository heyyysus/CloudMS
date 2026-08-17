import { faker } from "@faker-js/faker"

// Fixed seed so re-running `npm run db:seed` produces the same demo data
// (reproducible for screenshots/QA rather than different every run).
faker.seed(42)

export { faker }

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
