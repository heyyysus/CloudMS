// Formats a policy log's createdAt timestamp for the retro-terminal log
// list, e.g. "03/02/2026 - 02:31pm". Built from Intl.DateTimeFormat parts
// (not the joined/formatted string) because hour12 output is locale- and
// ICU-version-dependent ("2:31 PM" vs "02:31 PM", narrow vs regular space).
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: '2-digit',
  day: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

export function formatLogTimestamp(iso: string): string {
  const parts = dateTimeFormatter.formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  const date = `${get('month')}/${get('day')}/${get('year')}`
  const time = `${get('hour')}:${get('minute')}${get('dayPeriod').toLowerCase()}`
  return `${date} - ${time}`
}
