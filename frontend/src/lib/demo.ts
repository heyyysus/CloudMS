import { ApiError } from '@/api/client'

// The backend answers 403 { error: "... demo mode ..." } from the mail and
// storage seams when DEMO_MODE is on. Matched on the message because that is
// the only signal the body carries.
export function isDemoDisabledError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403 && /demo mode/i.test(err.message)
}

export function demoBannerText(resetMinutes?: number): string {
  if (!resetMinutes || resetMinutes <= 0) return 'Demo — all data is fake and resets periodically.'
  return `Demo — all data is fake and resets every ${resetMinutes} minute${resetMinutes === 1 ? '' : 's'}.`
}
