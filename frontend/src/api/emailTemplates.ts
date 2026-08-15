import { request } from './client'

export interface EmailTemplate {
  key: string
  subject: string
  body: string
  updatedAt: string
}

export interface EmailTemplateResponse {
  template: EmailTemplate
  mergeFields: string[]
}

export function getEmailTemplate(key: string, signal?: AbortSignal): Promise<EmailTemplateResponse> {
  return request(`/email-templates/${key}`, { signal })
}

export function updateEmailTemplate(
  key: string,
  body: { subject: string; body: string }
): Promise<EmailTemplateResponse> {
  return request(`/email-templates/${key}`, { method: 'PUT', body: JSON.stringify(body) })
}
