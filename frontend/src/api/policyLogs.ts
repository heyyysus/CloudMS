import { request } from './client'

// Logs are append-only: created via POST, never edited or deleted, so there
// is no update/delete body type here.
export interface PolicyLog {
  id: number
  policyId: number
  logNumber: number
  body: string
  createdAt: string
  author: {
    id: number
    name: string | null
    email: string
  }
}

export function getPolicyLogs(policyId: number, signal?: AbortSignal): Promise<PolicyLog[]> {
  return request(`/policy-logs?policyId=${policyId}`, { signal })
}

export interface CreatePolicyLogBody {
  policyId: number
  body: string
}

export function createPolicyLog(body: CreatePolicyLogBody): Promise<PolicyLog> {
  return request('/policy-logs', { method: 'POST', body: JSON.stringify(body) })
}
