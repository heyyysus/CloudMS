import { request } from './client'

export interface User {
  id: number
  email: string
  name: string | null
  role: 'admin' | 'staff'
}

export function loginWithGoogle(idToken: string): Promise<User> {
  return request<{ user: User }>('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  }).then((data) => data.user)
}

// Demo deployments only: mints a throwaway admin session for the given
// display name. The route is not mounted outside DEMO_MODE (404).
export function loginAsDemoUser(name: string): Promise<User> {
  return request<{ user: User }>('/auth/demo', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }).then((data) => data.user)
}

export function getMe(): Promise<User> {
  return request<{ user: User }>('/auth/me').then((data) => data.user)
}

export function logout(): Promise<void> {
  return request<{ ok: true }>('/auth/logout', { method: 'POST' }).then(() => undefined)
}
