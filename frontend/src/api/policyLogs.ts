import { request } from './client'

// Logs are append-only: created via POST, never edited or deleted, so there
// is no update/delete body type here.
export interface PolicyLog {
  id: string
  policyId: string
  logNumber: number
  body: string
  createdAt: string
  author: {
    id: string
    name: string | null
    email: string
  }
}

export function getPolicyLogs(policyId: string, signal?: AbortSignal): Promise<PolicyLog[]> {
  return request(`/policy-logs?policyId=${policyId}`, { signal })
}

export interface CreatePolicyLogBody {
  policyId: string
  body: string
}

export function createPolicyLog(body: CreatePolicyLogBody): Promise<PolicyLog> {
  return request('/policy-logs', { method: 'POST', body: JSON.stringify(body) })
}
