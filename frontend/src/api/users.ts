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

export interface InviteUserResult {
  user: User & { isActive: boolean; createdAt: string }
  email: InviteEmailResult
}

export function inviteUser(body: InviteUserBody): Promise<InviteUserResult> {
  return request('/users/invite', { method: 'POST', body: JSON.stringify(body) })
}
