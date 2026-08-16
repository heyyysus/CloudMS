// Formatting shared by every server-generated PDF (policy change forms and
// accounting documents). Pure string helpers - no PDFKit, no DB.

// PDFKit's standard fonts only support WinAnsi encoding, which doesn't
// include the unicode arrow used in "from → to" lines - it renders as
// garbage glyphs. (The em dash is in WinAnsi, so it passes through.) Swap in
// an ASCII arrow for the PDF only; the plain-text policy log keeps the real
// character.
export function sanitizeForPdf(text: string): string {
  return text.replace(/→/g, "->")
}

// Reformats a stored 'YYYY-MM-DD' date as 'MM/DD/YYYY'. Splits the string
// rather than using `new Date(...)`, which parses as UTC midnight and can
// shift a day in western timezones.
export function formatMmDdYyyy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  return `${month}/${day}/${year}`
}

// The server runs in UTC (no TZ set), so formatting with the ambient/local
// timezone - as the frontend does correctly in the browser for the policy
// log's timestamp - would print the wrong wall-clock time here. There's no
// browser to inherit a timezone from during server-side PDF generation, so
// the agency's timezone is named explicitly instead.
export const GENERATED_ON_TIME_ZONE = "America/Los_Angeles"

export function formatGeneratedOn(date: Date): string {
  const datePart = date.toLocaleDateString("en-US", {
    timeZone: GENERATED_ON_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: GENERATED_ON_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  })
  return `${datePart} ${timePart}`
}
