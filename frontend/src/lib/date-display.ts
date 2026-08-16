// Renders a stored 'YYYY-MM-DD' date as 'MM/DD/YYYY'. Splits the string
// rather than using `new Date(...)`, which parses as UTC midnight and shifts
// a day in western timezones — the same trap documented next to
// `localTodayIsoDate` in `policy-status.ts`.
export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const [, year, month, day] = match
  return `${month}/${day}/${year}`
}
