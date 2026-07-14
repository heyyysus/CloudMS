import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'

const inviteSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.email('Enter a valid email address'),
})

export type InviteFormValues = z.infer<typeof inviteSchema>

export function DemoForm({ onSubmit }: { onSubmit: (values: InviteFormValues) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<InviteFormValues>({ resolver: zodResolver(inviteSchema) })

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="invite-name">Name</FieldLabel>
          <Input id="invite-name" {...register('name')} />
          <FieldError errors={errors.name ? [errors.name] : undefined} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input id="invite-email" type="email" {...register('email')} />
          <FieldError errors={errors.email ? [errors.email] : undefined} />
        </Field>
        <Field orientation="horizontal">
          <Button type="submit">Invite user</Button>
        </Field>
      </FieldGroup>
    </form>
  )
}
