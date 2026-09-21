import { request } from './client'
import type { ClientListItem } from './clients'

export type SearchClientResult = ClientListItem

export interface SearchPolicyResult {
  id: string
  policyNumber: string
  status: 'pending' | 'active' | 'cancelled' | 'expired'
  effectiveDate: string
  expirationDate: string
  clientId: string
  clientName: string
}

export interface SearchResponse {
  clients: SearchClientResult[]
  policies: SearchPolicyResult[]
}

export function search(q: string, signal?: AbortSignal): Promise<SearchResponse> {
  return request(`/search?q=${encodeURIComponent(q)}`, { signal })
}

export type SearchFn = typeof search
