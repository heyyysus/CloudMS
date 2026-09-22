import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  createOrganization,
  listOrganizations,
  type CreateOrganizationBody,
  type CreateOrganizationFn,
  type CreateOrganizationResult,
  type ListOrganizationsFn,
} from '@/api/organizations'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SubmitButton } from '@/components/ui/submit-button'
import { useToast } from '@/components/ui/toast'

const createOrgFormSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(150, 'Max 150 characters'),
  slug: z
    .string()
    .trim()
    .min(1, 'Required')
    .max(64, 'Max 64 characters')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, and hyphens only'),
  adminEmail: z.email('Enter a valid email address').max(255, 'Max 255 characters'),
  adminName: z.string().trim().max(150, 'Max 150 characters'),
})

type CreateOrgFormValues = z.infer<typeof createOrgFormSchema>

interface PlatformProps {
  listOrganizationsFn?: ListOrganizationsFn
  createOrganizationFn?: CreateOrganizationFn
}

function Platform({
  listOrganizationsFn = listOrganizations,
  createOrganizationFn = createOrganization,
}: PlatformProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const {
    data: organizations,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['organizations'],
    queryFn: ({ signal }) => listOrganizationsFn(signal),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateOrgFormValues>({
    resolver: zodResolver(createOrgFormSchema),
    defaultValues: { name: '', slug: '', adminEmail: '', adminName: '' },
  })

  const mutation = useMutation<CreateOrganizationResult, Error, CreateOrganizationBody>({
    mutationFn: createOrganizationFn,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
      toast.success(`${result.organization.name} created`)
      reset()
    },
  })

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
        <p className="text-muted-foreground">Every organization on this deployment.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All organizations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isError && <p className="text-sm text-destructive">Failed to load organizations.</p>}
          {isPending && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {!isPending && !isError && organizations?.length === 0 && (
            <p className="text-sm text-muted-foreground">No organizations yet.</p>
          )}
          {!isPending &&
            !isError &&
            organizations?.map((org) => (
              <div
                key={org.id}
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
              >
                <span className="font-medium">{org.name}</span>
                <span className="text-xs text-muted-foreground">{org.slug}</span>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Create an organization</CardTitle>
          <CardDescription>Creates the organization and seats its first admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleSubmit((values) =>
              mutation.mutate({
                name: values.name.trim(),
                slug: values.slug.trim(),
                admin: {
                  email: values.adminEmail.trim(),
                  name: values.adminName.trim() || null,
                },
              })
            )}
            noValidate
          >
            <FieldGroup>
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="platform-org-name">Organization name</FieldLabel>
                <Input id="platform-org-name" autoFocus {...register('name')} />
                <FieldError errors={errors.name ? [errors.name] : undefined} />
              </Field>
              <Field data-invalid={!!errors.slug}>
                <FieldLabel htmlFor="platform-org-slug">Slug</FieldLabel>
                <Input id="platform-org-slug" placeholder="acme-insurance" {...register('slug')} />
                <FieldError errors={errors.slug ? [errors.slug] : undefined} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field data-invalid={!!errors.adminEmail}>
                  <FieldLabel htmlFor="platform-admin-email">Admin email</FieldLabel>
                  <Input
                    id="platform-admin-email"
                    type="email"
                    placeholder="admin@example.com"
                    {...register('adminEmail')}
                  />
                  <FieldError errors={errors.adminEmail ? [errors.adminEmail] : undefined} />
                </Field>
                <Field data-invalid={!!errors.adminName}>
                  <FieldLabel htmlFor="platform-admin-name">Admin name (optional)</FieldLabel>
                  <Input id="platform-admin-name" {...register('adminName')} />
                  <FieldError errors={errors.adminName ? [errors.adminName] : undefined} />
                </Field>
              </div>

              {mutation.isError && (
                <div role="alert" className="text-sm text-destructive">
                  {mutation.error.message}
                </div>
              )}
            </FieldGroup>

            <SubmitButton isPending={mutation.isPending} pendingLabel="Creating…" className="mt-4">
              Create organization
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

export default Platform
