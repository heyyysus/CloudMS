import { describe, expect, it } from 'vitest'
import { formatLogTimestamp } from './log-datetime'

// Local-time ISO strings (no trailing "Z") so these assertions don't shift
// with the machine's timezone.
describe('formatLogTimestamp', () => {
  it('formats a PM time', () => {
    expect(formatLogTimestamp('2026-03-02T14:31:00')).toBe('03/02/2026 - 02:31pm')
  })

  it('formats an AM time', () => {
    expect(formatLogTimestamp('2026-03-02T09:05:00')).toBe('03/02/2026 - 09:05am')
  })

  it('formats noon as 12pm', () => {
    expect(formatLogTimestamp('2026-03-02T12:00:00')).toBe('03/02/2026 - 12:00pm')
  })

  it('formats midnight as 12am', () => {
    expect(formatLogTimestamp('2026-03-02T00:00:00')).toBe('03/02/2026 - 12:00am')
  })
})
