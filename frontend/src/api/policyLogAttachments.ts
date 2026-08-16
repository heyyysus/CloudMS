import { request } from './client'
import type { PolicyAttachment } from './policyAttachments'

// One attachment shown under one log. The attachment is embedded rather than
// referenced so the log dialog renders without also holding the attachments
// list - and so a link keeps working for admins even when the document is
// voided and has dropped out of that list.
export interface PolicyLogAttachment {
  id: number
  logId: number
  createdAt: string
  // Who made the link, which the log dialog credits. Not the uploader, who
  // lives on `attachment.uploadedBy`.
  linkedBy: {
    id: number
    name: string | null
    email: string
  }
  attachment: PolicyAttachment
}

// Fetched once per policy rather than per log: the logs list badges every row
// that has attachments, and the detail dialog then filters this by logId.
export function getPolicyLogAttachments(
  policyId: number,
  signal?: AbortSignal
): Promise<PolicyLogAttachment[]> {
  return request(`/policy-log-attachments?policyId=${policyId}`, { signal })
}

export interface LinkAttachmentsToLogBody {
  logId: number
  attachmentIds: number[]
}

// Many attachments, one log - the shape of the Attachments subtab's selection
// mode. Re-linking a pair already linked is a no-op, not an error.
export function linkAttachmentsToLog(
  body: LinkAttachmentsToLogBody
): Promise<PolicyLogAttachment[]> {
  return request('/policy-log-attachments', { method: 'POST', body: JSON.stringify(body) })
}

// Takes the link's id, not the attachment's. Anyone may remove any link.
export function unlinkPolicyLogAttachment(id: number): Promise<void> {
  return request(`/policy-log-attachments/${id}`, { method: 'DELETE' })
}
