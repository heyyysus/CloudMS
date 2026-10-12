import { API_BASE, request } from './client'

export interface User {
  id: string
  email: string
  name: string | null
  // Null when the user has no picture at all. Otherwise an opaque token that
  // changes with every change to the picture; see avatarUrl().
  avatarVersion: string | null
}

// The picture is served by the API (which redirects to wherever it lives) so
// the session cookie is what authorizes it, same as any other request. The
// version in the query string is what stops the browser showing a cached
// previous photo after an upload.
export function avatarUrl(user: Pick<User, 'avatarVersion'>): string | null {
  return user.avatarVersion === null
    ? null
    : `${API_BASE}/auth/avatar?v=${encodeURIComponent(user.avatarVersion)}`
}

export interface Org {
  id: string
  name: string
  slug: string
}

export interface Membership {
  orgId: string
  name: string
  slug: string
  role: 'admin' | 'staff'
}

export type Role = Membership['role']

export interface Me {
  user: User
  org: Org | null
  memberships: Membership[]
  role: Role | null
}

interface MePayload {
  user: User & { role: Role | null }
  org: Org | null
  memberships: Membership[]
}

// The server also sends a derived `role` on `user`; re-derive it from
// `memberships` here so there is exactly one source of truth on the frontend.
function toMe(payload: MePayload): Me {
  const { role: _role, ...user } = payload.user
  return {
    user,
    org: payload.org,
    memberships: payload.memberships,
    role: payload.memberships.find((m) => m.orgId === payload.org?.id)?.role ?? null,
  }
}

export function loginWithGoogle(idToken: string): Promise<Me> {
  return request<MePayload>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  }).then(toMe)
}

export function getMe(): Promise<Me> {
  return request<MePayload>('/auth/me').then(toMe)
}

export function selectOrg(orgId: string): Promise<Me> {
  return request<MePayload>('/auth/org', {
    method: 'POST',
    body: JSON.stringify({ orgId }),
  }).then(toMe)
}

// Raw image bytes as the body; the server sniffs the real type and caps the
// size (2 MB), so send something already downscaled - see lib/avatar-image.
export function uploadAvatar(image: Blob): Promise<Me> {
  return request<MePayload>('/auth/avatar', {
    method: 'PUT',
    headers: { 'Content-Type': image.type || 'application/octet-stream' },
    body: image,
  }).then(toMe)
}

export function logout(): Promise<void> {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' }).then(() => undefined)
}
