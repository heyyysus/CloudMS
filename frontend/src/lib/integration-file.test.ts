import { describe, expect, it } from 'vitest'
import {
  mapGenderCode,
  mapMaritalStatusCode,
  mapRelationCode,
  normalizeBiLimit,
  normalizeSingleLimit,
  normalizeCommaAmount,
} from './integration-file'
import { BI_LIMITS, PD_LIMITS, UMPD_LIMITS, DEDUCTIBLES } from './coverage-options'

// This file only covers the pure (non-DOM) exports: the `unit` vitest
// project runs in a node environment with no DOMParser, so the full XML
// parse is exercised end-to-end by import-quote-dialog.stories.tsx instead
// (real Chromium via the `storybook` vitest project).

describe('mapGenderCode', () => {
  it('maps the verified ACORD codes', () => {
    expect(mapGenderCode('M')).toBe('m')
    expect(mapGenderCode('F')).toBe('f')
  })

  it('falls back to "other" for anything else, including a miss', () => {
    expect(mapGenderCode('U')).toBe('other')
    expect(mapGenderCode('')).toBe('other')
  })
})

describe('mapMaritalStatusCode', () => {
  it('maps the verified ACORD code', () => {
    expect(mapMaritalStatusCode('S')).toBe('single')
  })

  it('maps the other standard codes', () => {
    expect(mapMaritalStatusCode('M')).toBe('married')
    expect(mapMaritalStatusCode('D')).toBe('divorced')
    expect(mapMaritalStatusCode('W')).toBe('widowed')
  })

  it('falls back to "none" for an unknown or missing code', () => {
    expect(mapMaritalStatusCode('U')).toBe('none')
    expect(mapMaritalStatusCode('')).toBe('none')
  })
})

describe('mapRelationCode', () => {
  it('maps the verified ACORD code', () => {
    expect(mapRelationCode('IN')).toBe('self')
  })

  it('maps the other standard codes', () => {
    expect(mapRelationCode('SP')).toBe('spouse')
    expect(mapRelationCode('CH')).toBe('child')
  })

  it('falls back to "other" for an unknown or missing code', () => {
    expect(mapRelationCode('XX')).toBe('other')
    expect(mapRelationCode('')).toBe('other')
  })
})

describe('normalizeBiLimit', () => {
  it('divides by 1000 and joins with a slash, verified against the sample (30000/60000 -> 30/60)', () => {
    expect(normalizeBiLimit('30000', '60000', BI_LIMITS)).toBe('30/60')
  })

  it('collapses a >=1000 part to "<n>M"', () => {
    expect(normalizeBiLimit('500000', '1000000', BI_LIMITS)).toBe('500/1M')
  })

  it('falls back to the raw pair when the formatted value is not a known option', () => {
    expect(normalizeBiLimit('12345', '54321', BI_LIMITS)).toBe('12345/54321')
  })

  it('returns "" when both limits are missing', () => {
    expect(normalizeBiLimit('', '', BI_LIMITS)).toBe('')
  })

  it('returns whichever single limit is present when only one is found', () => {
    expect(normalizeBiLimit('30000', '', BI_LIMITS)).toBe('30000')
    expect(normalizeBiLimit('', '60000', BI_LIMITS)).toBe('60000')
  })
})

describe('normalizeSingleLimit', () => {
  it('divides by 1000, verified against the sample (15000 -> 15)', () => {
    expect(normalizeSingleLimit('15000', PD_LIMITS)).toBe('15')
  })

  it('divides a small value into UMPD_LIMITS\' decimal form (3500 -> "3.5")', () => {
    expect(normalizeSingleLimit('3500', UMPD_LIMITS)).toBe('3.5')
  })

  it('falls back to the raw value when the formatted value is not a known option', () => {
    expect(normalizeSingleLimit('99000', PD_LIMITS)).toBe('99000')
  })

  it('returns "" for a miss', () => {
    expect(normalizeSingleLimit('', PD_LIMITS)).toBe('')
  })
})

describe('normalizeCommaAmount', () => {
  it('comma-formats without dividing, verified against the sample (1000 -> "1,000")', () => {
    expect(normalizeCommaAmount('1000', DEDUCTIBLES)).toBe('1,000')
  })

  it('falls back to the raw value when the formatted value is not a known option', () => {
    expect(normalizeCommaAmount('987', DEDUCTIBLES)).toBe('987')
  })

  it('returns "" for a miss', () => {
    expect(normalizeCommaAmount('', DEDUCTIBLES)).toBe('')
  })
})
