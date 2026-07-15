import { describe, expect, it } from 'vitest'
import { displayStatus, localTodayIsoDate, sortPoliciesByCreatedAt } from './policy-status'

const TODAY = '2026-07-15'

describe('displayStatus', () => {
  it('returns the stored status when the policy has not expired', () => {
    expect(displayStatus({ status: 'active', expirationDate: '2027-01-01' }, TODAY)).toBe('active')
    expect(displayStatus({ status: 'pending', expirationDate: '2027-01-01' }, TODAY)).toBe(
      'pending'
    )
    expect(displayStatus({ status: 'cancelled', expirationDate: '2027-01-01' }, TODAY)).toBe(
      'cancelled'
    )
  })

  it('overrides the stored status when the expiration date is past', () => {
    expect(displayStatus({ status: 'active', expirationDate: '2026-07-14' }, TODAY)).toBe(
      'expired'
    )
    expect(displayStatus({ status: 'pending', expirationDate: '2020-01-01' }, TODAY)).toBe(
      'expired'
    )
  })

  it('does not count a same-day expiration as expired', () => {
    expect(displayStatus({ status: 'active', expirationDate: TODAY }, TODAY)).toBe('active')
  })

  it('keeps a stored expired status regardless of date', () => {
    expect(displayStatus({ status: 'expired', expirationDate: '2099-01-01' }, TODAY)).toBe(
      'expired'
    )
  })

  it('defaults today to the local date', () => {
    expect(localTodayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(displayStatus({ status: 'active', expirationDate: '1999-01-01' })).toBe('expired')
    expect(displayStatus({ status: 'active', expirationDate: '2999-01-01' })).toBe('active')
  })
})

describe('sortPoliciesByCreatedAt', () => {
  it('sorts oldest first without mutating the input', () => {
    const policies = [
      { id: 3, createdAt: '2026-03-01T00:00:00.000Z' },
      { id: 1, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, createdAt: '2026-02-01T00:00:00.000Z' },
    ]
    const sorted = sortPoliciesByCreatedAt(policies)
    expect(sorted.map((p) => p.id)).toEqual([1, 2, 3])
    expect(policies.map((p) => p.id)).toEqual([3, 1, 2])
  })

  it('breaks createdAt ties by id', () => {
    const createdAt = '2026-01-01T00:00:00.000Z'
    const sorted = sortPoliciesByCreatedAt([
      { id: 20, createdAt },
      { id: 10, createdAt },
    ])
    expect(sorted.map((p) => p.id)).toEqual([10, 20])
  })
})
