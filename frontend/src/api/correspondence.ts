import { request } from './client'

// The resolved merge-field values for one policy — the same map the server
// renders the outgoing message with, so the dialog's preview matches what the
// client receives. Keyed by merge-field name (clientFullName, policyNumber…).
export interface PolicyMergeValues {
  values: Record<string, string>
}

export interface SendCorrespondenceBody {
  templateId: number
  to: string[]
  cc?: string[]
}

export interface SendCorrespondenceResult {
  id: string
  to: string[]
  cc: string[]
  subject: string
}

export function getPolicyMergeValues(
  policyId: number,
  signal?: AbortSignal
): Promise<PolicyMergeValues> {
  return request(`/policies/${policyId}/merge-fields`, { signal })
}

export function sendPolicyCorrespondence(
  policyId: number,
  body: SendCorrespondenceBody
): Promise<SendCorrespondenceResult> {
  return request(`/policies/${policyId}/send-correspondence`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
