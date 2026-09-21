import { request } from './client'

export interface Person {
  id: string
  firstName: string
  lastName: string
  dateOfBirth: string
  maritalStatus: 'single' | 'married' | 'divorced' | 'widowed' | 'separated' | null
  gender: 'm' | 'f' | 'other'
  relationToInsured:
    | 'self'
    | 'spouse'
    | 'child'
    | 'sibling'
    | 'significant-other'
    | 'other-related'
    | 'other'
  createdAt: string
  updatedAt: string
}

export interface ClientPhone {
  id: string
  clientId: string
  phoneNumber: string
  createdAt: string
}

export interface ClientEmail {
  id: string
  clientId: string
  email: string
  createdAt: string
}

export interface AutoPolicy {
  id: string
  clientId: string
  carrierId: string
  policyNumber: string
  policyAddress1: string | null
  policyAddress2: string | null
  policyCity: string | null
  policyState: string | null
  policyZip: string | null
  effectiveDate: string
  expirationDate: string
  status: 'pending' | 'active' | 'cancelled' | 'expired'
  createdAt: string
  updatedAt: string
}

export interface ClientDetail {
  id: string
  namedInsuredId: string
  secondNamedInsuredId: string | null
  mailingAddress1: string | null
  mailingAddress2: string | null
  mailingCity: string | null
  mailingState: string | null
  mailingZip: string | null
  physicalAddress1: string | null
  physicalAddress2: string | null
  physicalCity: string | null
  physicalState: string | null
  physicalZip: string | null
  createdAt: string
  updatedAt: string
  namedInsured: Person
  secondNamedInsured: Person | null
  phones: ClientPhone[]
  emails: ClientEmail[]
  policies: AutoPolicy[]
}

export function getClient(id: string, signal?: AbortSignal): Promise<ClientDetail> {
  return request(`/clients/${id}`, { signal })
}

export type ClientListItem = Omit<ClientDetail, 'policies'>

export function listClients(q?: string, signal?: AbortSignal): Promise<ClientListItem[]> {
  const query = q ? `?q=${encodeURIComponent(q)}` : ''
  return request(`/clients${query}`, { signal })
}

export type ListClientsFn = typeof listClients

export interface UpdateClientBody {
  namedInsuredId?: string
  secondNamedInsuredId?: string | null
  mailingAddress1?: string | null
  mailingAddress2?: string | null
  mailingCity?: string | null
  mailingState?: string | null
  mailingZip?: string | null
  physicalAddress1?: string | null
  physicalAddress2?: string | null
  physicalCity?: string | null
  physicalState?: string | null
  physicalZip?: string | null
  /** Replace-all: omit to leave untouched, [] to delete all, [...] to replace the full set. */
  phones?: string[]
  /** Replace-all: omit to leave untouched, [] to delete all, [...] to replace the full set. */
  emails?: string[]
}

export function updateClient(id: string, body: UpdateClientBody): Promise<ClientDetail> {
  return request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export interface CreateClientBody extends UpdateClientBody {
  namedInsuredId: string
}

export function createClient(body: CreateClientBody): Promise<ClientDetail> {
  return request('/clients', { method: 'POST', body: JSON.stringify(body) })
}

export function clientDisplayName(client: {
  namedInsured: Pick<Person, 'firstName' | 'lastName'>
}): string {
  return `${client.namedInsured.firstName} ${client.namedInsured.lastName}`
}

// Ids are now opaque 22-char strings rather than zero-padded sequence
// numbers, so there is nothing left to format - this just documents the
// display convention (call sites still go through it in case that changes).
export function formatClientId(id: string): string {
  return id
}
