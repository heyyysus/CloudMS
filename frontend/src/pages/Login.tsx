import { useCallback, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/AuthContext'
import { useGoogleSignIn } from '../auth/useGoogleSignIn'
import { loginWithGoogle } from '../api/auth'
import { ApiError } from '../api/client'

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
          navigate('/', { replace: true })
        })
        .catch((err) => setSignInError(errorMessage(err)))
    },
    [navigate, setUser],
  )

  const { buttonRef, error: scriptError } = useGoogleSignIn(handleCredential)

  if (loading) return null
  if (user) return <Navigate to="/" replace />

  return (
    <section id="center" className="auth-page">
      <div>
        <h1>Sign in</h1>
        <p>Use your Google account to access CloudMS.</p>
      </div>
      <div ref={buttonRef} />
      {(scriptError || signInError) && (
        <p className="auth-error">{scriptError ?? signInError}</p>
      )}
    </section>
  )
}

export default Login
