import { describe, expect, it } from 'vitest'
import { formatPhone, formatPhoneInput, normalizePhone } from './phone'

describe('normalizePhone', () => {
  it('strips formatting to bare digits', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('5551234567')
  })

  it('strips a leading US country code', () => {
    expect(normalizePhone('+1-555-123-4567')).toBe('5551234567')
  })

  it('leaves other digit counts alone', () => {
    expect(normalizePhone('12345')).toBe('12345')
  })
})

describe('formatPhone', () => {
  it('formats 10 digits as (123) 456-7890', () => {
    expect(formatPhone('5551234567')).toBe('(555) 123-4567')
  })

  it('formats an 11-digit US number by dropping the leading 1', () => {
    expect(formatPhone('15551234567')).toBe('(555) 123-4567')
  })

  it('returns non-10-digit values unchanged', () => {
    expect(formatPhone('12345')).toBe('12345')
  })

  it('returns empty/nullish input as an empty string', () => {
    expect(formatPhone('')).toBe('')
    expect(formatPhone(null)).toBe('')
    expect(formatPhone(undefined)).toBe('')
  })
})

describe('formatPhoneInput', () => {
  it('formats progressively as digits are typed', () => {
    expect(formatPhoneInput('5')).toBe('(5')
    expect(formatPhoneInput('555')).toBe('(555')
    expect(formatPhoneInput('5551')).toBe('(555) 1')
    expect(formatPhoneInput('5551234')).toBe('(555) 123-4')
    expect(formatPhoneInput('5551234567')).toBe('(555) 123-4567')
  })

  it('passes an extension or an 11+ digit number through unchanged', () => {
    expect(formatPhoneInput('(555) 123-4567 x99')).toBe('(555) 123-4567 x99')
    expect(formatPhoneInput('+44 20 7946 0958')).toBe('+44 20 7946 0958')
  })

  it('returns empty input unchanged', () => {
    expect(formatPhoneInput('')).toBe('')
  })
})
