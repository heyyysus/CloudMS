// Phone numbers are stored as free-text (`clientPhones.phoneNumber`), so
// these all degrade gracefully: anything that isn't exactly 10 US digits
// (after stripping a leading country code 1) passes through unchanged rather
// than being mangled.

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

// Bare digits for storage — strips a leading US country code so
// "+1 (555) 123-4567" and "5551234567" normalize to the same value.
export function normalizePhone(value: string): string {
  const digits = digitsOnly(value)
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

// Display formatting: exactly 10 digits (after stripping a leading 1) become
// "(123) 456-7890"; anything else is returned as-is.
export function formatPhone(value: string | null | undefined): string {
  if (!value) return ''
  const digits = normalizePhone(value)
  if (digits.length !== 10) return value
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

// Progressive mask for an input's onChange: formats as many digits as have
// been typed so far, so the field reads "(123) 45" mid-entry. Only engages
// for a plain 10-digit-or-fewer US number in progress - once typing goes
// past 10 digits (an extension, a longer international number), formatting
// backs off and the value passes through exactly as typed.
export function formatPhoneInput(value: string): string {
  const digits = digitsOnly(value)
  if (digits.length === 0 || digits.length > 10) return value
  if (digits.length < 4) return `(${digits}`
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}
