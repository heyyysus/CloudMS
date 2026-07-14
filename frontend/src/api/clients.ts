import { request } from './client'

export interface Person {
  id: number
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
  id: number
  clientId: number
  phoneNumber: string
  createdAt: string
}

export interface ClientEmail {
  id: number
  clientId: number
  email: string
  createdAt: string
}

export interface AutoPolicy {
  id: number
  clientId: number
  carrierId: number
  policyNumber: string
  policyAddress: string | null
  effectiveDate: string
  expirationDate: string
  status: 'pending' | 'active' | 'cancelled' | 'expired'
  createdAt: string
  updatedAt: string
}

export interface ClientDetail {
  id: number
  namedInsuredId: number
  secondNamedInsuredId: number | null
  mailingAddress: string | null
  physicalAddress: string | null
  createdAt: string
  updatedAt: string
  namedInsured: Person
  secondNamedInsured: Person | null
  phones: ClientPhone[]
  emails: ClientEmail[]
  policies: AutoPolicy[]
}

export function getClient(id: number, signal?: AbortSignal): Promise<ClientDetail> {
  return request(`/clients/${id}`, { signal })
}

export function clientDisplayName(client: {
  namedInsured: Pick<Person, 'firstName' | 'lastName'>
}): string {
  return `${client.namedInsured.firstName} ${client.namedInsured.lastName}`
}
