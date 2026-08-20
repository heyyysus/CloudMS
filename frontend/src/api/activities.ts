import { request } from './client'
import type { ScheduledEmailStatus } from './reminders'

// What is scheduled to happen on a policy. The id is namespaced
// ("scheduled-email:42") and every row carries kind/source, so the manually
// created tasks planned for later can join this list without the shape
// changing under the components that render it.
export interface PolicyActivity {
  id: string
  kind: 'reminder'
  title: string
  detail: string | null
  scheduledFor: string
  sentAt: string | null
  status: ScheduledEmailStatus
  source: 'automation'
  cancellable: boolean
  lastError: string | null
}

export function getPolicyActivities(
  policyId: number,
  signal?: AbortSignal
): Promise<{ activities: PolicyActivity[] }> {
  return request(`/policies/${policyId}/activities`, { signal })
}
