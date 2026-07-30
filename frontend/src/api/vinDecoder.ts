import { request } from './client'

export interface VinDecodeResult {
  isValid: boolean
  year?: string
  make?: string
  model?: string
}

// Decodes a VIN through the backend, which proxies the NHTSA vPIC lookup. An
// unrecognized VIN comes back as `isValid: false` rather than an error, so only
// a genuine failure (network, 502) throws.
export function decodeVIN(vin: string, signal?: AbortSignal): Promise<VinDecodeResult> {
  return request(`/vin-decode?vin=${encodeURIComponent(vin)}`, { signal })
}
