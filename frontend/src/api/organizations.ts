import { request } from './client'

export interface OrganizationListItem {
  id: string
  name: string
  slug: string
}

export interface CreateOrganizationBody {
  name: string
  slug: string
  admin: {
    email: string
    name?: string | null
  }
}

export interface CreateOrganizationResult {
  organization: OrganizationListItem
  admin: {
    id: string
    email: string
    name: string | null
    role: 'admin' | 'staff'
  }
  email: {
    status: 'sent' | 'failed'
    resendId?: string
    error?: string
  }
}

export function listOrganizations(signal?: AbortSignal): Promise<OrganizationListItem[]> {
  return request<{ organizations: OrganizationListItem[] }>('/organizations', { signal }).then(
    (res) => res.organizations
  )
}

export type ListOrganizationsFn = typeof listOrganizations

export function createOrganization(body: CreateOrganizationBody): Promise<CreateOrganizationResult> {
  return request('/organizations', { method: 'POST', body: JSON.stringify(body) })
}

export type CreateOrganizationFn = typeof createOrganization
