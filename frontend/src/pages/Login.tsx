import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useGoogleSignIn } from '../auth/useGoogleSignIn'
import { loginWithGoogle } from '../api/auth'
import { ApiError } from '../api/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

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

  const { buttonRef, error: scriptError } = useGoogleSignIn(handleCredential)

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
            <div className="flex justify-center" ref={buttonRef} />
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
