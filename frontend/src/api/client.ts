const BASE = '/api/v1'

export class ApiError extends Error {
  status: number
  // The parsed error body, when the response had one - lets a caller read a
  // field beyond `error` (e.g. the invite endpoint's `deletedUserId`) without
  // every other call site needing to know it exists.
  body?: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    ...init,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? res.statusText, body)
  }

  // DELETE endpoints answer 204 with no body, which res.json() would choke on.
  // Callers of those declare Promise<void>, so undefined is the right value.
  if (res.status === 204) return undefined as T

  return res.json()
}
