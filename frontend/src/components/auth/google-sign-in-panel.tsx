import { useGoogleSignIn } from '@/auth/useGoogleSignIn'

interface GoogleSignInPanelProps {
  onCredential: (idToken: string) => void
  signInError: string | null
}

// The Google block lifted out of Login.tsx. Lives in its own component so the
// login page can render it conditionally: useGoogleSignIn injects the GSI
// script and reports a missing VITE_GOOGLE_CLIENT_ID as an error, neither of
// which should happen on a demo deployment.
export function GoogleSignInPanel({ onCredential, signInError }: GoogleSignInPanelProps) {
  const { buttonRef, error: scriptError } = useGoogleSignIn(onCredential)

  return (
    <>
      <div className="grid gap-3">
        <div className="flex justify-center" ref={buttonRef} />
      </div>
      {(scriptError || signInError) && (
        <p className="mt-4 text-center text-sm text-destructive">{scriptError ?? signInError}</p>
      )}
    </>
  )
}
