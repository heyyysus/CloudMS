import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useAppConfig } from '../config/AppConfigContext'
import { loginWithGoogle, type User } from '../api/auth'
import { ApiError } from '../api/client'
import { DemoSignInForm } from '@/components/auth/demo-sign-in-form'
import { GoogleSignInPanel } from '@/components/auth/google-sign-in-panel'
import { DemoBanner } from '@/components/layout/demo-banner'
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
  const { config, loading: configLoading } = useAppConfig()
  const navigate = useNavigate()
  const [signInError, setSignInError] = useState<string | null>(null)

  const handleSignedIn = useCallback(
    (loggedInUser: User) => {
      setUser(loggedInUser)
      navigate('/home', { replace: true })
    },
    [navigate, setUser],
  )

  const handleCredential = useCallback(
    (idToken: string) => {
      setSignInError(null)
      loginWithGoogle(idToken)
        .then(handleSignedIn)
        .catch((err) => setSignInError(errorMessage(err)))
    },
    [handleSignedIn],
  )

  // Wait for the config too: painting the Google panel first would inject the
  // GSI script on a demo host, and the demo form on a real one would flash.
  if (loading || configLoading) return null
  if (user) return <Navigate to="/home" replace />

  return (
    <div className="flex min-h-svh flex-col bg-muted/40">
      <DemoBanner demoMode={config.demoMode} resetMinutes={config.demoResetMinutes} />
      <div className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              {config.demoMode ? 'Enter the demo' : 'Sign in to CloudMS'}
            </CardTitle>
            <CardDescription>
              {config.demoMode
                ? 'Pick a display name — no account needed.'
                : 'Use your Google account to access CloudMS.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {config.demoMode ? (
              <DemoSignInForm onSignedIn={handleSignedIn} />
            ) : (
              <GoogleSignInPanel onCredential={handleCredential} signInError={signInError} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Login
