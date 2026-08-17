import { request } from './client'

export interface Carrier {
  id: number
  name: string
  naic: string
  isActive: boolean
  phone: string | null
  email: string | null
  website: string | null
  producerCode: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CarrierBody {
  name: string
  naic: string
  isActive?: boolean
  phone?: string | null
  email?: string | null
  website?: string | null
  producerCode?: string | null
  notes?: string | null
}

export function getCarriers(signal?: AbortSignal): Promise<Carrier[]> {
  return request('/carriers', { signal })
}

export function createCarrier(body: CarrierBody): Promise<Carrier> {
  return request('/carriers', { method: 'POST', body: JSON.stringify(body) })
}

// There is deliberately no deleteCarrier: policies, invoice items, and trust
// ledger rows all reference carriers with no cascade, so retiring one is
// `isActive: false` rather than a delete that the server would reject anyway.
export function updateCarrier(id: number, body: Partial<CarrierBody>): Promise<Carrier> {
  return request(`/carriers/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}
