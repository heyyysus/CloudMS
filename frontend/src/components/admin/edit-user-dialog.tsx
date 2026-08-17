import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { AdminUser, UpdateUserBody } from '@/api/users'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SubmitButton } from '@/components/ui/submit-button'

const editUserSchema = z.object({
  name: z.string().trim().max(150, 'Max 150 characters'),
  role: z.enum(['staff', 'admin']),
  isActive: z.enum(['active', 'disabled']),
})

type EditUserValues = z.infer<typeof editUserSchema>

interface EditUserFormProps {
  user: AdminUser
  // Set when the admin is editing their own row: the server refuses a self
  // role change or self-disable, so those controls are locked rather than
  // offered and rejected.
  isSelf?: boolean
  onSubmit: (body: UpdateUserBody) => void
  onCancel: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function EditUserForm({
  user,
  isSelf = false,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: EditUserFormProps) {
  const defaults: EditUserValues = {
    name: user.name ?? '',
    role: user.role,
    isActive: user.isActive ? 'active' : 'disabled',
  }

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: defaults,
  })

  // The dialog keeps this form mounted across rows in the list, so re-sync
  // when the user being edited changes.
  useEffect(() => {
    reset({
      name: user.name ?? '',
      role: user.role,
      isActive: user.isActive ? 'active' : 'disabled',
    })
  }, [user, reset])

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          name: values.name.trim() || null,
          role: values.role,
          isActive: values.isActive === 'active',
        })
      )}
      noValidate
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="edit-user-email">Email</FieldLabel>
          <Input id="edit-user-email" value={user.email} readOnly disabled />
        </Field>
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="edit-user-name">Name</FieldLabel>
          <Input id="edit-user-name" autoFocus {...register('name')} />
          <FieldError errors={errors.name ? [errors.name] : undefined} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="edit-user-role">Role</FieldLabel>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isSelf}>
                  <SelectTrigger id="edit-user-role">
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
          <Field>
            <FieldLabel htmlFor="edit-user-status">Status</FieldLabel>
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={isSelf}>
                  <SelectTrigger id="edit-user-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        {isSelf && (
          <p className="text-sm text-muted-foreground">
            You can rename yourself, but not change your own role or disable your own account.
          </p>
        )}

        {errorMessage && (
          <div role="alert" className="text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </FieldGroup>

      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton isPending={isPending} pendingLabel="Saving…">
          Save
        </SubmitButton>
      </div>
    </form>
  )
}

interface EditUserDialogProps {
  user: AdminUser | null
  isSelf?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (body: UpdateUserBody) => void
  isPending?: boolean
  errorMessage?: string | null
}

// Controlled by the list rather than owning its own trigger: one dialog serves
// every row, so the list decides which user it is showing.
export function EditUserDialog({
  user,
  isSelf,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  errorMessage,
}: EditUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Change this person's name, role, and whether they can sign in.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <EditUserForm
            user={user}
            isSelf={isSelf}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
            isPending={isPending}
            errorMessage={errorMessage}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
