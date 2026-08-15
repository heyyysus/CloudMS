// Parses a TurboRater ".tt2x" (or plain ".xml") rater bridge file into the
// shape CloudMS's Add Client / Add Policy forms expect, so a dropped file can
// prefill those forms instead of the user hand-typing everything.
//
// A .tt2x is a `key::value` text file with an ACORD PersAutoPolicyQuoteInqRq
// XML payload inlined after "bridgedata::" (no separating newline). This
// module locates that payload, parses it with the browser's DOMParser, and
// extracts only the fields CloudMS's schema requires.
//
// Every extraction returns '' (or an empty array) on a miss — nothing here
// is trusted. The caller lands every value in an editable form field, so a
// wrong or missing selector costs the user some typing, never a bad write.
//
// Field paths below were verified against two real TurboRater exports (one
// liability-only, one full-coverage, same insured) — see the "Verified
// against two real samples" section of the import feature's design notes.
// Paths NOT covered by either sample (UM/UMPD/MedPay coverage codes,
// rental/towing coverage codes, multi-vehicle/multi-driver files) are
// best-effort: same DOMParser plumbing, unverified selectors, documented
// inline where used.

import type { Person } from '@/api/clients'
import { BI_LIMITS, PD_LIMITS, UMPD_LIMITS, MEDPAY_LIMITS, DEDUCTIBLES, TOWING_LIMITS } from '@/lib/coverage-options'

export class IntegrationFileParseError extends Error {}

// ─── Public types ──────────────────────────────────────────────────────────

export interface ParsedDriver {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: Person['gender']
  maritalStatus: 'none' | 'single' | 'married' | 'divorced' | 'widowed' | 'separated'
  relationToInsured: Person['relationToInsured']
  dlNumber: string
}

export interface ParsedInsured extends ParsedDriver {
  address1: string
  city: string
  state: string
  zip: string
  phone: string
  email: string
}

export interface ParsedVehicle {
  vin: string
  make: string
  model: string
  year: string
  garagingZip: string
  coll: string
  comp: string
  rental: string
  towing: string
}

export interface ParsedDefaultCoverages {
  bi: string
  pd: string
  umbi: string
  umpd: string
  medpay: string
}

export interface ParsedQuote {
  insured: ParsedInsured
  additionalDrivers: ParsedDriver[]
  vehicles: ParsedVehicle[]
  defaultCoverages: ParsedDefaultCoverages
  policyNumber: string
  effectiveDate: string
  expirationDate: string
}

// ─── Code maps ──────────────────────────────────────────────────────────────
// Verified: GenderCd 'M' and MaritalStatusCd 'S' both appear in the samples.
// The other codes ('F', 'D', 'W') follow the same ACORD convention but are
// unexercised by either sample.

export function mapGenderCode(cd: string): Person['gender'] {
  const upper = cd.trim().toUpperCase()
  if (upper === 'M') return 'm'
  if (upper === 'F') return 'f'
  return 'other'
}

export function mapMaritalStatusCode(cd: string): ParsedDriver['maritalStatus'] {
  switch (cd.trim().toUpperCase()) {
    case 'S':
      return 'single'
    case 'M':
      return 'married'
    case 'D':
      return 'divorced'
    case 'W':
      return 'widowed'
    default:
      return 'none'
  }
}

// Verified: DriverRelationshipToApplicantCd 'IN' appears in both samples
// (the named insured's own driver record). The others are standard ACORD
// codes, unverified.
export function mapRelationCode(cd: string): Person['relationToInsured'] {
  switch (cd.trim().toUpperCase()) {
    case 'IN':
      return 'self'
    case 'SP':
      return 'spouse'
    case 'CH':
      return 'child'
    default:
      return 'other'
  }
}

// ─── Coverage normalization ─────────────────────────────────────────────────
// CloudMS coverage dropdowns (frontend/src/lib/coverage-options.ts) use two
// different display conventions for the same raw ACORD dollar integer:
//   - BI / PD / UM-BI / UM-PD: divided by 1000 ("30000" -> "30"), and for
//     BI/UM-BI specifically, >=1000 collapses to "<n>M" ("1000000" -> "1M").
//     Verified: BI "30000/60000" -> "30/60" (in BI_LIMITS); PD "15000" ->
//     "15" (in PD_LIMITS).
//   - Deductibles (COLL/COMP) and MedPay: the raw dollar amount with comma
//     separators, NOT divided ("1000" -> "1,000"). Verified: COLL/COMP
//     "1000" -> "1,000" (in DEDUCTIBLES).
//
// In both cases: if the formatted value isn't a member of the target option
// array, the raw ACORD value is returned instead. CoverageSelect
// (add-policy-dialog.tsx) already preserves an out-of-list value as a
// selectable "legacy" item, so the user still sees and can edit it.

function dividedAmount(raw: string, allowMega: boolean): string {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || n <= 0) return raw
  const divided = n / 1000
  if (allowMega && divided >= 1000) return `${divided / 1000}M`
  return String(divided)
}

function commaAmount(raw: string): string {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || n < 0) return raw
  return n.toLocaleString('en-US')
}

// BI / UM-BI: two limits (per-person, per-accident) joined "X/Y".
export function normalizeBiLimit(
  perPerson: string,
  perAccident: string,
  options: readonly string[]
): string {
  if (!perPerson && !perAccident) return ''
  if (!perPerson || !perAccident) return perPerson || perAccident
  const formatted = `${dividedAmount(perPerson, true)}/${dividedAmount(perAccident, true)}`
  return options.includes(formatted) ? formatted : `${perPerson}/${perAccident}`
}

// PD / UM-PD: a single divided limit.
export function normalizeSingleLimit(raw: string, options: readonly string[]): string {
  if (!raw) return ''
  const formatted = dividedAmount(raw, false)
  return options.includes(formatted) ? formatted : raw
}

// COLL / COMP deductibles and MedPay: comma-formatted, not divided.
export function normalizeCommaAmount(raw: string, options: readonly string[]): string {
  if (!raw) return ''
  const formatted = commaAmount(raw)
  return options.includes(formatted) ? formatted : raw
}

// ─── XML helpers ─────────────────────────────────────────────────────────────
// Adapted from the user's quote-tools parser (heyyysus/quote-tools,
// src/utility/ParseIntegrationFile.ts).

function parseXml(xmlString: string): Document {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlString, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new IntegrationFileParseError('XML parse error: ' + err.textContent)
  return doc
}

function getText(parent: Element | Document | null | undefined, selector: string): string {
  return parent?.querySelector(selector)?.textContent?.trim() ?? ''
}

// Scoped to `parent` (a PersVeh element), so this only ever sees that
// vehicle's own <Coverage> children — never the ~14 policy-level fee/tax
// <Coverage> nodes that sit under PersAutoLineBusiness (CoverageCd like
// TPAC/POLFE/LAWFE, verified present in both samples, none of them carry a
// <Limit> or <Deductible>).
function findCoverage(parent: Element | null, cd: string): Element | null {
  if (!parent) return null
  return Array.from(parent.querySelectorAll('Coverage')).find((c) => getText(c, 'CoverageCd') === cd) ?? null
}

function limitValue(coverage: Element | null, appliesTo: string): string {
  if (!coverage) return ''
  const limit = Array.from(coverage.querySelectorAll('Limit')).find(
    (l) => getText(l, 'LimitAppliesToCd') === appliesTo
  )
  return limit ? getText(limit, 'FormatInteger') : ''
}

function deductibleValue(coverage: Element | null): string {
  return getText(coverage, 'Deductible FormatInteger')
}

// Preference order: Cell -> Home -> Phone (business). Verified: the Cell
// entry in both samples carries the only non-empty PhoneNumber.
function extractPhone(commNode: Element | null): string {
  if (!commNode) return ''
  const phones = Array.from(commNode.querySelectorAll('PhoneInfo'))
  for (const type of ['Cell', 'Home', 'Phone'] as const) {
    const match = phones.find((p) => getText(p, 'PhoneTypeCd') === type && getText(p, 'PhoneNumber') !== '')
    if (match) return getText(match, 'PhoneNumber')
  }
  return ''
}

// Extracts everything CloudMS needs about a single <PersDriver> element:
// used both for the "IN" (insured) driver and for every additional driver.
// Verified paths (both present in the samples): GeneralPartyInfo/NameInfo/
// PersonName, DriverInfo/PersonInfo/{BirthDt,GenderCd,MaritalStatusCd},
// PersDriverInfo/DriverRelationshipToApplicantCd, and DriverInfo's license
// number (two redundant paths in the samples, DriversLicense/
// DriversLicenseNumber and License/LicensePermitNumber — both present with
// the same value; the former is tried first as the more specifically-named
// ACORD field).
function extractDriver(driverEl: Element): ParsedDriver {
  const nameEl = driverEl.querySelector('GeneralPartyInfo NameInfo PersonName')
  const personInfo = driverEl.querySelector('DriverInfo PersonInfo')
  const driverInfo = driverEl.querySelector('DriverInfo')
  return {
    firstName: getText(nameEl, 'GivenName'),
    lastName: getText(nameEl, 'Surname'),
    dateOfBirth: getText(personInfo, 'BirthDt'),
    gender: mapGenderCode(getText(personInfo, 'GenderCd')),
    maritalStatus: mapMaritalStatusCode(getText(personInfo, 'MaritalStatusCd')),
    relationToInsured: mapRelationCode(getText(driverEl, 'PersDriverInfo DriverRelationshipToApplicantCd')),
    dlNumber:
      getText(driverInfo, 'DriversLicense DriversLicenseNumber') ||
      getText(driverInfo, 'License LicensePermitNumber'),
  }
}

// ─── Main parser ─────────────────────────────────────────────────────────────

export function parseIntegrationFile(raw: string): ParsedQuote {
  const xmlStart = raw.indexOf('<?xml')
  if (xmlStart === -1) {
    throw new IntegrationFileParseError(
      'Could not find XML content in the file (expected "<?xml" after "bridgedata::").'
    )
  }
  const doc = parseXml(raw.slice(xmlStart))

  // Scoped exactly as the quote-tools parser scopes it: the FIRST
  // InsuredOrPrincipal descendant of PersApplicationInfo. Verified this is
  // the data-bearing one (real address, correct DOB/gender) — the file also
  // has a sibling <Addr> directly under PersApplicationInfo with a junk
  // postal code ("-"), but that sibling sits OUTSIDE this InsuredOrPrincipal
  // node, so scoping through it (rather than a loose document-wide
  // querySelector('PostalCode')) never touches the junk value.
  const appInfo = doc.querySelector('PersApplicationInfo')
  const insuredNode = appInfo?.querySelector('InsuredOrPrincipal') ?? null
  const insuredParty = insuredNode?.querySelector('GeneralPartyInfo') ?? null
  const insuredAddr = insuredParty?.querySelector('Addr') ?? null
  const insuredComm = insuredParty?.querySelector('Communications') ?? null

  // The insured's own DOB/gender/marital status/DL number live on the
  // matching <PersDriver> (DriverRelationshipToApplicantCd = "IN"), not on
  // InsuredOrPrincipal — verified present there in both samples.
  const allDrivers = Array.from(doc.querySelectorAll('PersDriver'))
  const insuredDriverEl = allDrivers.find(
    (d) => getText(d, 'PersDriverInfo DriverRelationshipToApplicantCd') === 'IN'
  )
  const insuredDriverDetail: ParsedDriver = insuredDriverEl
    ? extractDriver(insuredDriverEl)
    : {
        firstName: '',
        lastName: '',
        dateOfBirth: '',
        gender: 'other',
        maritalStatus: 'none',
        relationToInsured: 'self',
        dlNumber: '',
      }

  const insured: ParsedInsured = {
    // Prefer the name on InsuredOrPrincipal (present even if no "IN" driver
    // record exists); fall back to the driver record's name otherwise.
    firstName: getText(insuredParty, 'NameInfo PersonName GivenName') || insuredDriverDetail.firstName,
    lastName: getText(insuredParty, 'NameInfo PersonName Surname') || insuredDriverDetail.lastName,
    dateOfBirth: insuredDriverDetail.dateOfBirth,
    gender: insuredDriverDetail.gender,
    maritalStatus: insuredDriverDetail.maritalStatus,
    relationToInsured: 'self',
    dlNumber: insuredDriverDetail.dlNumber,
    address1: getText(insuredAddr, 'Addr1'),
    city: getText(insuredAddr, 'City'),
    state: getText(insuredAddr, 'StateProvCd'),
    zip: getText(insuredAddr, 'PostalCode'),
    phone: extractPhone(insuredComm),
    email: getText(insuredComm, 'EmailInfo EmailAddr'),
  }

  const additionalDrivers = allDrivers
    .filter((d) => getText(d, 'PersDriverInfo DriverRelationshipToApplicantCd') !== 'IN')
    .map(extractDriver)

  const vehicleEls = Array.from(doc.querySelectorAll('PersVeh'))
  const vehicles: ParsedVehicle[] = vehicleEls.map((veh) => {
    const collCoverage = findCoverage(veh, 'COLL')
    const compCoverage = findCoverage(veh, 'COMP')
    // Best-effort: not present in either sample, so these ACORD codes are
    // unverified guesses. A miss yields '' like every other extraction.
    const rentalCoverage = findCoverage(veh, 'RREIM')
    const towingCoverage = findCoverage(veh, 'TOW')

    const locRef = veh.getAttribute('LocationRef')
    const location = locRef ? doc.querySelector(`Location[id="${CSS.escape(locRef)}"]`) : null
    const garagingZip = getText(location, 'Addr PostalCode') || insured.zip

    return {
      vin: getText(veh, 'VehIdentificationNumber'),
      make: getText(veh, 'Manufacturer'),
      model: getText(veh, 'Model'),
      year: getText(veh, 'ModelYear'),
      garagingZip,
      coll: normalizeCommaAmount(deductibleValue(collCoverage), DEDUCTIBLES),
      comp: normalizeCommaAmount(deductibleValue(compCoverage), DEDUCTIBLES),
      // No known ACORD code/format verified for rental reimbursement (a
      // compound "daily/total" limit, e.g. RENTAL_LIMITS's "20/600" — not
      // derivable from a single FormatInteger), so this is left raw/unfound
      // rather than guessed.
      rental: getText(rentalCoverage, 'Limit FormatInteger'),
      towing: normalizeCommaAmount(getText(towingCoverage, 'Limit FormatInteger'), TOWING_LIMITS),
    }
  })

  // Shared "default coverages" (BI/PD/UM-BI/UM-PD/MedPay) come from the
  // first vehicle, mirroring how the Add Policy form itself treats them
  // (see toFormValues's comment in add-policy-dialog.tsx: these fan out
  // from a single set of fields to every vehicle on submit). Verified: BI
  // and PD are present on the vehicle, not at the policy level. UM-BI/
  // UM-PD/MedPay CoverageCd values ('UM', 'UMPD', 'MEDPM') are unverified —
  // neither sample carries uninsured-motorist or medpay coverage.
  const firstVeh = vehicleEls[0] ?? null
  const biCoverage = findCoverage(firstVeh, 'BI')
  const pdCoverage = findCoverage(firstVeh, 'PD')
  const umbiCoverage = findCoverage(firstVeh, 'UM')
  const umpdCoverage = findCoverage(firstVeh, 'UMPD')
  const medpayCoverage = findCoverage(firstVeh, 'MEDPM')

  const defaultCoverages: ParsedDefaultCoverages = {
    bi: normalizeBiLimit(limitValue(biCoverage, 'PerPerson'), limitValue(biCoverage, 'PerAccident'), BI_LIMITS),
    pd: normalizeSingleLimit(limitValue(pdCoverage, 'PropDam'), PD_LIMITS),
    umbi: normalizeBiLimit(
      limitValue(umbiCoverage, 'PerPerson'),
      limitValue(umbiCoverage, 'PerAccident'),
      BI_LIMITS
    ),
    umpd: normalizeSingleLimit(limitValue(umpdCoverage, 'PropDam'), UMPD_LIMITS),
    medpay: normalizeCommaAmount(getText(medpayCoverage, 'Limit FormatInteger'), MEDPAY_LIMITS),
  }

  const policyNumber = getText(doc, 'PersPolicy PolicyNumber')
  const effectiveDate = getText(doc, 'PersPolicy ContractTerm EffectiveDt')
  const expirationDate = getText(doc, 'PersPolicy ContractTerm ExpirationDt')

  return { insured, additionalDrivers, vehicles, defaultCoverages, policyNumber, effectiveDate, expirationDate }
}
