import { Navigate, Outlet } from 'react-router'
import { useAuth } from './AuthContext'
import { Loader2 } from 'lucide-react'

export function RequireAuth() {
  const { user, org, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!org) return <Navigate to="/select-org" replace />

  return <Outlet />
}
