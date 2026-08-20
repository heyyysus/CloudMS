import type { ScheduledEmailStatus } from '@/api/reminders'

export const SCHEDULED_EMAIL_STATUS_LABEL: Record<ScheduledEmailStatus, string> = {
  pending: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export const SCHEDULED_EMAIL_STATUS_TEXT_CLASS: Record<ScheduledEmailStatus, string> = {
  pending: 'text-primary',
  sending: 'text-primary',
  sent: 'text-muted-foreground',
  failed: 'text-destructive',
  cancelled: 'text-muted-foreground line-through',
}

// "in 12 days" / "3 days ago" - the question an agent has about a scheduled
// reminder is how far off it is, not its exact timestamp, which the title
// attribute carries for anyone who needs it.
const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

export function formatRelativeDays(iso: string, now: Date = new Date()): string {
  const target = new Date(iso)
  const msPerDay = 24 * 60 * 60 * 1000
  // Compared as whole days in the viewer's zone so something later today reads
  // "today" rather than "in 0 days".
  const startOfDay = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((startOfDay(target) - startOfDay(now)) / msPerDay)
  return relative.format(days, 'day')
}

// Days before the trigger date, as an admin reads it. Negative offsets chase a
// policy after the fact, so they have to read the other way round.
export function formatOffsetDays(offsetDays: number): string {
  if (offsetDays === 0) return 'On the expiration date'
  const magnitude = Math.abs(offsetDays)
  const unit = magnitude === 1 ? 'day' : 'days'
  return offsetDays > 0
    ? `${magnitude} ${unit} before expiration`
    : `${magnitude} ${unit} after expiration`
}
