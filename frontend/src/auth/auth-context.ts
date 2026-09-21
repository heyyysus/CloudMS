import { createContext } from 'react'
import type { Me, Org, Role, User, Membership } from '../api/auth'

export interface AuthContextValue {
  user: User | null
  org: Org | null
  memberships: Membership[]
  role: Role | null
  loading: boolean
  setMe: (me: Me | null) => void
  setOrg: (orgId: string) => Promise<void>
}

// Kept out of AuthContext.tsx so that file only exports components (the
// fast-refresh lint rule), and so stories can render a page against a fixed
// auth state instead of standing up AuthProvider and stubbing /auth/me.
export const AuthContext = createContext<AuthContextValue | null>(null)
