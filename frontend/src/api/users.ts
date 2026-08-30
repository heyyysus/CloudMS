import { request } from './client'
import type { User } from './auth'

export interface InviteUserBody {
  email: string
  name?: string | null
  role: 'admin' | 'staff'
}

export interface InviteEmailResult {
  status: 'sent' | 'failed'
  resendId?: string
  error?: string
}

// The admin view of a user: everything `User` carries plus the account state
// only admins need. `hasSignedIn` distinguishes an invited user who has never
// completed a Google sign-in from one who has.
export interface AdminUser extends User {
  isActive: boolean
  hasSignedIn: boolean
  createdAt: string
  updatedAt: string
}

export interface InviteUserResult {
  user: AdminUser
  email: InviteEmailResult
}

export interface UpdateUserBody {
  name?: string | null
  role?: 'admin' | 'staff'
  isActive?: boolean
}

export function inviteUser(body: InviteUserBody): Promise<InviteUserResult> {
  return request('/users/invite', { method: 'POST', body: JSON.stringify(body) })
}

export function getUsers(signal?: AbortSignal): Promise<AdminUser[]> {
  return request('/users', { signal })
}

export function updateUser(id: number, body: UpdateUserBody): Promise<AdminUser> {
  return request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export function resendWelcome(id: number): Promise<{ email: InviteEmailResult }> {
  return request(`/users/${id}/resend-welcome`, { method: 'POST' })
}

// Soft delete: the account disappears from getUsers and can never sign in
// again. The row itself survives server-side (see backend comment on
// users.deletedAt) - the only way back is restoreUser, reached by re-inviting
// the same email.
export function deleteUser(id: number): Promise<void> {
  return request(`/users/${id}`, { method: 'DELETE' })
}

export function restoreUser(id: number): Promise<InviteUserResult> {
  return request(`/users/${id}/restore`, { method: 'POST' })
}
