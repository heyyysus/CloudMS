import { request } from './client'

export type ScheduledEmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'

export interface ReminderRule {
  id: number
  name: string
  trigger: 'policy_expiration'
  offsetDays: number
  templateId: number
  enabled: boolean
  updatedAt: string
  template: { id: number; key: string; name: string | null; subject: string } | null
}

export interface ReminderRuleBody {
  name: string
  offsetDays: number
  templateId: number
  enabled?: boolean
}

export function getReminderRules(signal?: AbortSignal): Promise<{ rules: ReminderRule[] }> {
  return request('/reminder-rules', { signal })
}

export function createReminderRule(body: ReminderRuleBody): Promise<ReminderRule> {
  return request('/reminder-rules', { method: 'POST', body: JSON.stringify(body) })
}

export function updateReminderRule(
  id: number,
  body: Partial<ReminderRuleBody>
): Promise<ReminderRule> {
  return request(`/reminder-rules/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function deleteReminderRule(id: number): Promise<void> {
  return request(`/reminder-rules/${id}`, { method: 'DELETE' })
}

// One queued send, with enough client/policy context to be readable in the
// agency-wide Upcoming list where there is no surrounding policy card.
export interface ScheduledEmail {
  id: number
  status: ScheduledEmailStatus
  scheduledFor: string
  sentAt: string | null
  occurrenceDate: string
  attempts: number
  lastError: string | null
  subject: string | null
  ruleName: string | null
  templateName: string | null
  policyId: number
  policyNumber: string
  clientId: number
  clientName: string
}

export function getScheduledEmails(
  statuses?: ScheduledEmailStatus[],
  signal?: AbortSignal
): Promise<{ scheduled: ScheduledEmail[] }> {
  const query = statuses?.length ? `?status=${statuses.join(',')}` : ''
  return request(`/scheduled-emails${query}`, { signal })
}

export function cancelScheduledEmail(id: number): Promise<ScheduledEmail> {
  return request(`/scheduled-emails/${id}/cancel`, { method: 'POST' })
}

export function runReminderTick(): Promise<unknown> {
  return request('/reminders/tick', { method: 'POST' })
}
