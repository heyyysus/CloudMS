import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('takes the first letter of the first two words in the name', () => {
    expect(initials({ name: 'Jane Staff', email: 'jane@example.com' })).toBe('JS')
  })

  it('handles a single-word name', () => {
    expect(initials({ name: 'Cher', email: 'cher@example.com' })).toBe('C')
  })

  it('falls back to the email when name is null', () => {
    expect(initials({ name: null, email: 'jane.doe@example.com' })).toBe('JD')
  })

  it('takes the first letter of the first two dot/at-separated email parts', () => {
    expect(initials({ name: null, email: 'admin@example.com' })).toBe('AE')
  })
})
