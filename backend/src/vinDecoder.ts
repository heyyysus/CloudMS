// VIN decoding against the NHTSA vPIC API. This lives server-side rather than
// in the browser so the vendor URL and response shape stay out of the client,
// the lookup sits behind the app's session auth, and a cache can be added here
// later without touching the frontend. Responses are not cached yet.
const VPIC_BASE = "https://vpic.nhtsa.dot.gov/api"

const UPSTREAM_TIMEOUT_MS = 5000

// Raised when vPIC is unreachable, times out, or answers non-2xx, so the route
// can map it to a 502 instead of letting it surface as a generic 500.
export class VinDecodeUpstreamError extends Error {}

export interface VinDecodeResult {
  isValid: boolean
  year?: string
  make?: string
  model?: string
}

interface VpicResponse {
  Count: number
  Results: {
    ModelYear?: string
    Make?: string
    Model?: string
  }[]
}

// vPIC returns empty strings for fields it couldn't determine rather than
// omitting them.
function orUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export async function decodeVin(vin: string): Promise<VinDecodeResult> {
  const url = `${VPIC_BASE}/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`

  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
  } catch (err) {
    throw new VinDecodeUpstreamError(`VIN lookup request failed: ${String(err)}`)
  }

  if (!res.ok) {
    throw new VinDecodeUpstreamError(`VIN lookup returned ${res.status}`)
  }

  let body: VpicResponse
  try {
    body = (await res.json()) as VpicResponse
  } catch (err) {
    throw new VinDecodeUpstreamError(`VIN lookup returned invalid JSON: ${String(err)}`)
  }

  const result = body.Count > 0 ? body.Results?.[0] : undefined
  const year = orUndefined(result?.ModelYear)
  const make = orUndefined(result?.Make)
  const model = orUndefined(result?.Model)

  // A VIN vPIC can't identify at all comes back with no year/make/model; treat
  // that as "not found" rather than a valid decode with empty fields.
  if (!year && !make && !model) {
    return { isValid: false }
  }

  return { isValid: true, year, make, model }
}
