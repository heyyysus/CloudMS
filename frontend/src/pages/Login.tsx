import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useGoogleSignIn } from '../auth/useGoogleSignIn'
import { loginWithGoogle } from '../api/auth'
import { ApiError } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) return "Your Google account isn't authorized for this app. Ask an admin for an invite."
    if (err.status === 401) return "Google sign-in couldn't be verified. Please try again."
  }
  return 'Sign-in failed. Please try again.'
}

function Login() {
  const { user, loading, setUser } = useAuth()
  const navigate = useNavigate()
  const [signInError, setSignInError] = useState<string | null>(null)

  const handleCredential = useCallback(
    (idToken: string) => {
      setSignInError(null)
      loginWithGoogle(idToken)
        .then((loggedInUser) => {
          setUser(loggedInUser)
          navigate('/home', { replace: true })
        })
        .catch((err) => setSignInError(errorMessage(err)))
    },
    [navigate, setUser],
  )

  const { buttonRef, ready, error: scriptError } = useGoogleSignIn(handleCredential)

  if (loading) return null
  if (user) return <Navigate to="/home" replace />

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Sign in to CloudMS</CardTitle>
          <CardDescription>Use your Google account to access CloudMS.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            <div className="relative flex min-h-11 items-center">
              {!ready && <Skeleton className="absolute inset-0" />}
              {/* Kept laid out (transparent, not `hidden`) while GIS renders: it needs a
                  measurable box, and the button width is read off this element. Its height
                  is clamped until then so GIS's transient two-line render can't shift the
                  card. */}
              <div
                ref={buttonRef}
                className={cn(
                  'flex w-full justify-center transition-opacity duration-150',
                  ready ? 'opacity-100' : 'h-11 overflow-hidden opacity-0',
                )}
              />
            </div>
          </div>
          {(scriptError || signInError) && (
            <p className="mt-4 text-center text-sm text-destructive">
              {scriptError ?? signInError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default Login
