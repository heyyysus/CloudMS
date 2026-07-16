import { request } from './client'
import type { AutoPolicy, Person } from './clients'

export interface Carrier {
  id: number
  name: string
  naic: string
  createdAt: string
  updatedAt: string
}

export interface Vehicle {
  id: number
  policyId: number
  vin: string
  make: string
  model: string
  year: number
  garagingZip: string
  coverageBi: string | null
  coveragePd: string | null
  coverageUmbi: string | null
  coverageUmpd: string | null
  coverageCdw: string | null
  coverageMedpay: string | null
  coverageColl: string | null
  coverageComp: string | null
  coverageRentalReimbursement: string | null
  coverageTowing: string | null
  createdAt: string
  updatedAt: string
}

export interface PolicyDriver {
  id: number
  policyId: number
  driverId: number
  createdAt: string
  driver: {
    id: number
    personId: number
    dlNumber: string | null
    rating: string
    sr22: boolean
    person: Person
  }
}

export interface PolicyDetail extends AutoPolicy {
  client: {
    id: number
    namedInsuredId: number
    secondNamedInsuredId: number | null
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
  }
  carrier: Carrier
  vehicles: Vehicle[]
  policyDrivers: PolicyDriver[]
}

export function getPolicy(id: number, signal?: AbortSignal): Promise<PolicyDetail> {
  return request(`/policies/${id}`, { signal })
}

export function getCarriers(signal?: AbortSignal): Promise<Carrier[]> {
  return request('/carriers', { signal })
}

export interface CreatePolicyVehicleBody {
  vin: string
  make: string
  model: string
  year: number
  garagingZip: string
  coverageBi?: string | null
  coveragePd?: string | null
  coverageUmbi?: string | null
  coverageUmpd?: string | null
  coverageCdw?: string | null
  coverageMedpay?: string | null
  coverageColl?: string | null
  coverageComp?: string | null
  coverageRentalReimbursement?: string | null
  coverageTowing?: string | null
}

export type CreatePolicyDriverBody =
  | {
      kind: 'existing'
      personId: number
      // required by the server when the person has no drivers row yet
      dlNumber?: string
      rating?: 'rated' | 'excluded'
      sr22?: boolean
    }
  | {
      kind: 'new'
      person: {
        firstName: string
        lastName: string
        dateOfBirth: string
        gender: Person['gender']
        relationToInsured: Person['relationToInsured']
        maritalStatus?: Person['maritalStatus']
      }
      dlNumber: string
      rating: 'rated' | 'excluded'
      sr22: boolean
    }

export interface CreatePolicyBody {
  clientId: number
  carrierId: number
  policyNumber: string
  policyAddress1: string | null
  policyAddress2: string | null
  policyCity: string | null
  policyState: string | null
  policyZip: string | null
  effectiveDate: string
  expirationDate: string
  status: AutoPolicy['status']
  vehicles?: CreatePolicyVehicleBody[]
  drivers?: CreatePolicyDriverBody[]
}

export function createPolicy(body: CreatePolicyBody): Promise<PolicyDetail> {
  return request('/policies', { method: 'POST', body: JSON.stringify(body) })
}

// PATCH semantics: omitted fields are left unchanged; `vehicles`/`drivers`
// are replace-all when present ([] clears, [...] replaces atomically).
export type UpdatePolicyBody = Partial<CreatePolicyBody>

export function updatePolicy(id: number, body: UpdatePolicyBody): Promise<PolicyDetail> {
  return request(`/policies/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
