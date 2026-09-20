import { request } from './client'

// Metadata only - there is no URL on this type. Download links are minted on
// demand via getPolicyAttachmentLink, never baked into the list response.
// What produced the attachment. Anything other than 'upload' is a document the
// server generated; sourceId points at the policy/invoice/receipt it records.
export type AttachmentSourceType = 'upload' | 'policy_change' | 'invoice' | 'receipt'

export interface PolicyAttachment {
  id: string
  policyId: string
  fileName: string
  description: string | null
  mimeType: string
  sizeBytes: number
  // Set when the invoice or payment this document records was voided. Staff
  // never receive these rows at all; admins do, and the list marks them.
  isVoided: boolean
  sourceType: AttachmentSourceType
  sourceId: string | null
  createdAt: string
  uploadedBy: {
    id: string
    name: string | null
    email: string
  }
}

export function getPolicyAttachments(
  policyId: string,
  signal?: AbortSignal
): Promise<PolicyAttachment[]> {
  return request(`/policy-attachments?policyId=${policyId}`, { signal })
}

export interface GetPolicyAttachmentLinkOptions {
  disposition?: 'attachment'
  signal?: AbortSignal
}

export function getPolicyAttachmentLink(
  id: string,
  options?: GetPolicyAttachmentLinkOptions
): Promise<{ url: string }> {
  const query = options?.disposition ? `?disposition=${options.disposition}` : ''
  return request(`/policy-attachments/${id}/link${query}`, { signal: options?.signal })
}

export interface PresignAttachmentUploadBody {
  policyId: string
  fileName: string
  contentType: string
  sizeBytes: number
}

export interface PresignAttachmentUploadResult {
  uploadUrl: string
  storageKey: string
}

export function presignPolicyAttachmentUpload(
  body: PresignAttachmentUploadBody
): Promise<PresignAttachmentUploadResult> {
  return request('/policy-attachments/presign', { method: 'POST', body: JSON.stringify(body) })
}

export interface ConfirmAttachmentUploadBody {
  policyId: string
  storageKey: string
  fileName: string
  description?: string | null
}

export function confirmPolicyAttachmentUpload(
  body: ConfirmAttachmentUploadBody
): Promise<PolicyAttachment> {
  return request('/policy-attachments/confirm', { method: 'POST', body: JSON.stringify(body) })
}
