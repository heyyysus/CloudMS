import { Navigate, Outlet } from 'react-router'
import type { Role } from '@/api/auth'
import { useAuth } from './AuthContext'

interface RequireRoleProps {
  role: Role
}

// Nests under RequireAuth, so `user`/`org` are already resolved by the time
// this renders. The backend enforces the same rule on every route behind
// here; this only keeps someone from landing on a page with nothing they can
// use.
export function RequireRole({ role }: RequireRoleProps) {
  const { role: activeRole } = useAuth()

  if (activeRole !== role) return <Navigate to="/home" replace />

  return <Outlet />
}
