import type { AutoPolicy } from '@/api/clients'

export type PolicyDisplayStatus = AutoPolicy['status']

const pad = (n: number) => String(n).padStart(2, '0')

// Local-date 'YYYY-MM-DD'. Built from local date parts because
// new Date('YYYY-MM-DD') parses as UTC midnight and shifts a day in
// western timezones.
export function localTodayIsoDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// The status a policy should display as: a past expiration date overrides
// whatever status is stored. Same-day expiration still counts as in force.
export function displayStatus(
  policy: Pick<AutoPolicy, 'status' | 'expirationDate'>,
  today: string = localTodayIsoDate()
): PolicyDisplayStatus {
  return policy.expirationDate < today ? 'expired' : policy.status
}

export const STATUS_TEXT_CLASS: Record<PolicyDisplayStatus, string> = {
  active: 'text-success',
  pending: 'text-warning',
  cancelled: 'text-destructive',
  expired: 'text-muted-foreground',
}

export const STATUS_DOT_CLASS: Record<PolicyDisplayStatus, string> = {
  active: 'bg-success',
  pending: 'bg-warning',
  cancelled: 'bg-destructive',
  expired: 'bg-muted-foreground',
}

// Oldest first; id tiebreak keeps order stable for policies created in the
// same batch (shared createdAt timestamps).
export function sortPoliciesByCreatedAt<T extends Pick<AutoPolicy, 'createdAt' | 'id'>>(
  policies: T[]
): T[] {
  return [...policies].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id - b.id)
}
