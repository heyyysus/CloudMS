import { request } from './client'

export interface CorrespondenceTemplate {
  id: string
  key: string
  name: string
  subject: string
  body: string
  updatedAt: string
}

export interface CorrespondenceTemplatesResponse {
  templates: CorrespondenceTemplate[]
  mergeFields: string[]
}

export interface CorrespondenceTemplateBody {
  name: string
  subject: string
  body: string
}

export function getCorrespondenceTemplates(
  signal?: AbortSignal
): Promise<CorrespondenceTemplatesResponse> {
  return request('/correspondence-templates', { signal })
}

export function createCorrespondenceTemplate(
  body: CorrespondenceTemplateBody
): Promise<CorrespondenceTemplate> {
  return request('/correspondence-templates', { method: 'POST', body: JSON.stringify(body) })
}

export function updateCorrespondenceTemplate(
  id: string,
  body: CorrespondenceTemplateBody
): Promise<CorrespondenceTemplate> {
  return request(`/correspondence-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function deleteCorrespondenceTemplate(id: string): Promise<void> {
  return request(`/correspondence-templates/${id}`, { method: 'DELETE' })
}
