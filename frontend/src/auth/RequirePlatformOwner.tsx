import { Navigate, Outlet } from 'react-router'
import { useAuth } from './AuthContext'
import { Loader2 } from 'lucide-react'

// Mounted outside RequireAuth/AppLayout: a platform owner with zero
// memberships has an unbound session, and RequireAuth would bounce them to
// /select-org before this ever runs.
export function RequirePlatformOwner() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!user.isPlatformOwner) return <Navigate to="/home" replace />

  return <Outlet />
}
