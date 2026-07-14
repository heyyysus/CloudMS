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
    mailingAddress: string | null
    physicalAddress: string | null
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
