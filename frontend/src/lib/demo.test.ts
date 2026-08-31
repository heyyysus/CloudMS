import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/client'
import { demoBannerText, isDemoDisabledError } from './demo'

describe('demoBannerText', () => {
  it('falls back to static copy without an interval', () => {
    expect(demoBannerText(undefined)).toBe('Demo — all data is fake and resets periodically.')
    expect(demoBannerText(0)).toBe('Demo — all data is fake and resets periodically.')
  })

  it('uses the singular for one minute', () => {
    expect(demoBannerText(1)).toBe('Demo — all data is fake and resets every 1 minute.')
  })

  it('names the interval', () => {
    expect(demoBannerText(30)).toBe('Demo — all data is fake and resets every 30 minutes.')
  })
})

describe('isDemoDisabledError', () => {
  it('matches a 403 that names demo mode', () => {
    expect(isDemoDisabledError(new ApiError(403, 'Disabled in demo mode'))).toBe(true)
  })

  it('ignores a 403 with unrelated copy', () => {
    expect(isDemoDisabledError(new ApiError(403, 'Admins only'))).toBe(false)
  })

  it('ignores other statuses', () => {
    expect(isDemoDisabledError(new ApiError(500, 'Disabled in demo mode'))).toBe(false)
  })

  it('ignores non-ApiError values', () => {
    expect(isDemoDisabledError(new Error('Disabled in demo mode'))).toBe(false)
    expect(isDemoDisabledError(null)).toBe(false)
  })
})
