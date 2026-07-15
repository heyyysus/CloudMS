import { z } from 'zod'

export interface Address {
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export const US_STATES: { value: string; label: string }[] = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'DC', label: 'District of Columbia' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
]

export const addressFormSchema = z.object({
  address1: z.string(),
  address2: z.string(),
  city: z.string(),
  state: z.string().refine((v) => v === '' || /^[A-Z]{2}$/.test(v), 'Enter a 2-letter state'),
  zip: z
    .string()
    .refine((v) => v === '' || /^\d{5}(-\d{4})?$/.test(v), 'Enter a 5-digit ZIP'),
})

export type AddressFormValues = z.infer<typeof addressFormSchema>

export function toAddressFormValues(a: Address): AddressFormValues {
  return {
    address1: a.address1 ?? '',
    address2: a.address2 ?? '',
    city: a.city ?? '',
    state: a.state ?? '',
    zip: a.zip ?? '',
  }
}

export function toNullableAddress(v: AddressFormValues): Address {
  const nullableTrim = (value: string) => {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  return {
    address1: nullableTrim(v.address1),
    address2: nullableTrim(v.address2),
    city: nullableTrim(v.city),
    state: nullableTrim(v.state),
    zip: nullableTrim(v.zip),
  }
}

export function isEmptyAddress(a: Address): boolean {
  return [a.address1, a.address2, a.city, a.state, a.zip].every(
    (value) => !value || value.trim() === ''
  )
}

// Joins the parts of an address for read-only display, skipping empty ones.
// Returns null when every part is empty so callers can render a '—' fallback.
export function formatAddress(a: Address): string | null {
  const street = [a.address1, a.address2].filter((s) => !!s && s.trim() !== '').join(', ')
  const stateZip = [a.state, a.zip].filter((s) => !!s && s.trim() !== '').join(' ')
  const cityLine = [a.city, stateZip].filter((s) => !!s && s.trim() !== '').join(', ')
  const parts = [street, cityLine].filter((s) => s !== '')
  return parts.length > 0 ? parts.join(', ') : null
}

type AddressPrefix = 'mailing' | 'physical' | 'policy'

type FlatAddressFields<P extends AddressPrefix> = {
  [K in `${P}Address1` | `${P}Address2` | `${P}City` | `${P}State` | `${P}Zip`]: string | null
}

// Bridges the flat, prefixed API shape (`mailingAddress1`, `mailingCity`, …)
// to the nested `Address` shape used by forms and `formatAddress`.
export function pickAddress<P extends AddressPrefix>(
  obj: FlatAddressFields<P>,
  prefix: P
): Address {
  const source = obj as unknown as Record<string, string | null>
  return {
    address1: source[`${prefix}Address1`],
    address2: source[`${prefix}Address2`],
    city: source[`${prefix}City`],
    state: source[`${prefix}State`],
    zip: source[`${prefix}Zip`],
  }
}

export function flattenAddress<P extends AddressPrefix>(
  prefix: P,
  a: Address
): FlatAddressFields<P> {
  return {
    [`${prefix}Address1`]: a.address1,
    [`${prefix}Address2`]: a.address2,
    [`${prefix}City`]: a.city,
    [`${prefix}State`]: a.state,
    [`${prefix}Zip`]: a.zip,
  } as FlatAddressFields<P>
}
