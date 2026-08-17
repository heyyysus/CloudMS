import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation } from '@tanstack/react-query'
import { SubmitButton } from '@/components/ui/submit-button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { inviteUser, type InviteUserBody, type InviteUserResult } from '@/api/users'
import { useToast } from '@/components/ui/toast'

const inviteFormSchema = z.object({
  email: z.email('Enter a valid email address').max(255, 'Max 255 characters'),
  name: z.string().trim().max(150, 'Max 150 characters'),
  role: z.enum(['staff', 'admin']),
})

type InviteFormValues = z.infer<typeof inviteFormSchema>

interface InviteUserFormProps {
  onSubmit: (body: InviteUserBody) => void
  isPending?: boolean
  errorMessage?: string | null
  // Bumped by the parent on a successful invite so the form can clear
  // itself; left alone on error so the admin doesn't lose what they typed.
  resetToken?: number
}

export function InviteUserForm({
  onSubmit,
  isPending,
  errorMessage,
  resetToken,
}: InviteUserFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InviteFormValues>({
    resolver: zodResolver(inviteFormSchema),
    defaultValues: { email: '', name: '', role: 'staff' },
  })

  useEffect(() => {
    if (resetToken) reset()
  }, [resetToken, reset])

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          email: values.email.trim(),
          name: values.name.trim() || null,
          role: values.role,
        })
      )}
      noValidate
    >
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="invite-form-email">Email</FieldLabel>
          <Input
            id="invite-form-email"
            type="email"
            autoFocus
            placeholder="person@example.com"
            {...register('email')}
          />
          <FieldError errors={errors.email ? [errors.email] : undefined} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="invite-form-name">Name (optional)</FieldLabel>
            <Input id="invite-form-name" {...register('name')} />
            <FieldError errors={errors.name ? [errors.name] : undefined} />
          </Field>
          <Field>
            <FieldLabel htmlFor="invite-form-role">Role</FieldLabel>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="invite-form-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="staff">Staff</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        {errorMessage && (
          <div role="alert" className="text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </FieldGroup>

      <SubmitButton isPending={isPending} pendingLabel="Inviting…" className="mt-4">
        Invite user
      </SubmitButton>
    </form>
  )
}

interface InviteUserCardProps {
  inviteUserFn?: typeof inviteUser
}

export function InviteUserCard({ inviteUserFn = inviteUser }: InviteUserCardProps) {
  const toast = useToast()
  const mutation = useMutation<InviteUserResult, Error, InviteUserBody>({
    mutationFn: inviteUserFn,
    onSuccess: () => toast.success('New user created'),
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite a user</CardTitle>
        <CardDescription>
          Creates their account and emails them a welcome message. They sign in with Google - no
          password to set.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InviteUserForm
          onSubmit={(body) => mutation.mutate(body)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
          resetToken={mutation.isSuccess ? mutation.data.user.id : undefined}
        />
        {mutation.isSuccess && mutation.data.email.status === 'sent' && (
          <div role="status" className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
            Invited {mutation.data.user.email} — welcome email sent.
          </div>
        )}
        {mutation.isSuccess && mutation.data.email.status === 'failed' && (
          <div role="status" className="mt-4 text-sm text-amber-600 dark:text-amber-400">
            User {mutation.data.user.email} was created, but the welcome email failed
            {mutation.data.email.error ? `: ${mutation.data.email.error}` : ''}. They can still
            sign in with Google.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
