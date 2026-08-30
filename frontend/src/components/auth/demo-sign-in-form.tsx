import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { loginAsDemoUser, type User } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { SubmitButton } from '@/components/ui/submit-button'

const demoSignInSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80, 'Max 80 characters'),
})

type DemoSignInValues = z.infer<typeof demoSignInSchema>

export function demoSignInErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'The demo is busy right now — try again in a moment.'
    if (err.status === 503) return 'The demo is unavailable right now.'
  }
  return 'Sign-in failed. Please try again.'
}

interface DemoSignInFormProps {
  onSignedIn: (user: User) => void
  signInFn?: typeof loginAsDemoUser
}

// The demo replacement for the Google button: pick a display name, get a
// throwaway session. The page owns what happens after (setUser + navigate).
export function DemoSignInForm({ onSignedIn, signInFn = loginAsDemoUser }: DemoSignInFormProps) {
  const [pending, setPending] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<DemoSignInValues>({
    resolver: zodResolver(demoSignInSchema),
    defaultValues: { name: '' },
  })

  const submit = handleSubmit(async ({ name }) => {
    setSignInError(null)
    setPending(true)
    try {
      const user = await signInFn(name)
      onSignedIn(user)
    } catch (err) {
      setSignInError(demoSignInErrorMessage(err))
    } finally {
      setPending(false)
    }
  })

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="demo-sign-in-name">Display name</FieldLabel>
        <Input id="demo-sign-in-name" autoComplete="off" autoFocus {...register('name')} />
        <FieldError errors={errors.name ? [errors.name] : undefined} />
      </Field>
      {signInError && (
        <p role="alert" className="text-center text-sm text-destructive">
          {signInError}
        </p>
      )}
      <SubmitButton isPending={pending} pendingLabel="Entering…" className="w-full">
        Enter demo
      </SubmitButton>
    </form>
  )
}
