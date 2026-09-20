import type { Carrier } from './carriers'
import { request } from './client'
import type { AutoPolicy, Person } from './clients'

export interface Vehicle {
  id: string
  policyId: string
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
  id: string
  policyId: string
  driverId: string
  createdAt: string
  driver: {
    id: string
    personId: string
    dlNumber: string | null
    rating: string
    sr22: boolean
    person: Person
  }
}

export interface PolicyDetail extends AutoPolicy {
  client: {
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
  }
  carrier: Carrier
  vehicles: Vehicle[]
  policyDrivers: PolicyDriver[]
}

export function getPolicy(id: string, signal?: AbortSignal): Promise<PolicyDetail> {
  return request(`/policies/${id}`, { signal })
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
      personId: string
      // ignored by the server when the person already has a drivers row
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
      dlNumber?: string
      rating: 'rated' | 'excluded'
      sr22: boolean
    }

export interface CreatePolicyBody {
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
  status: AutoPolicy['status']
  vehicles?: CreatePolicyVehicleBody[]
  drivers?: CreatePolicyDriverBody[]
  // Meaningful only on updates (the date this endorsement takes effect, for
  // the generated change form) - ignored by the create endpoint.
  endorsementEffectiveDate?: string
}

export function createPolicy(body: CreatePolicyBody): Promise<PolicyDetail> {
  return request('/policies', { method: 'POST', body: JSON.stringify(body) })
}

// PATCH semantics: omitted fields are left unchanged; `vehicles`/`drivers`
// are replace-all when present ([] clears, [...] replaces atomically).
export type UpdatePolicyBody = Partial<CreatePolicyBody>

export function updatePolicy(id: string, body: UpdatePolicyBody): Promise<PolicyDetail> {
  return request(`/policies/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
