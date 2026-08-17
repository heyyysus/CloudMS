import { Navigate, Outlet } from 'react-router'
import type { User } from '@/api/auth'
import { useAuth } from './AuthContext'

interface RequireRoleProps {
  role: User['role']
}

// Nests under RequireAuth, so `user` is already resolved by the time this
// renders. The backend enforces the same rule on every route behind here; this
// only keeps someone from landing on a page with nothing they can use.
export function RequireRole({ role }: RequireRoleProps) {
  const { user } = useAuth()

  if (user?.role !== role) return <Navigate to="/home" replace />

  return <Outlet />
}
