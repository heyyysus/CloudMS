import { describe, expect, it } from 'vitest'
import { formatDate } from './date-display'

describe('formatDate', () => {
  it('formats an ISO date as MM/DD/YYYY', () => {
    expect(formatDate('1987-07-22')).toBe('07/22/1987')
  })

  it('returns null for an empty or missing value', () => {
    expect(formatDate('')).toBeNull()
    expect(formatDate(null)).toBeNull()
    expect(formatDate(undefined)).toBeNull()
  })

  it('returns null for a non-ISO string', () => {
    expect(formatDate('not a date')).toBeNull()
  })
})
