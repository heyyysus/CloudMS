import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { Carrier, CarrierBody } from '@/api/carriers'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'

// Mirrors the server's limits (varchar lengths and the email/URL formats in
// createCarrierBody) so the common mistakes are caught before a round trip.
const carrierFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(150, 'Max 150 characters'),
  naic: z.string().trim().min(1, 'NAIC is required').max(10, 'Max 10 characters'),
  producerCode: z.string().trim().max(50, 'Max 50 characters'),
  phone: z.string().trim().max(30, 'Max 30 characters'),
  email: z.union([z.literal(''), z.email('Enter a valid email address').max(255)]),
  website: z.union([z.literal(''), z.url('Enter a full URL, e.g. https://example.com').max(255)]),
  notes: z.string().trim().max(2000, 'Max 2000 characters'),
  isActive: z.enum(['active', 'inactive']),
})

type CarrierFormValues = z.infer<typeof carrierFormSchema>

function toDefaults(carrier?: Carrier): CarrierFormValues {
  return {
    name: carrier?.name ?? '',
    naic: carrier?.naic ?? '',
    producerCode: carrier?.producerCode ?? '',
    phone: carrier?.phone ?? '',
    email: carrier?.email ?? '',
    website: carrier?.website ?? '',
    notes: carrier?.notes ?? '',
    isActive: carrier && !carrier.isActive ? 'inactive' : 'active',
  }
}

interface CarrierFormProps {
  initial?: Carrier
  submitLabel: string
  pendingLabel: string
  onSubmit: (body: CarrierBody) => void
  onCancel: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function CarrierForm({
  initial,
  submitLabel,
  pendingLabel,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: CarrierFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CarrierFormValues>({
    resolver: zodResolver(carrierFormSchema),
    defaultValues: toDefaults(initial),
  })

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit({
          name: values.name.trim(),
          naic: values.naic.trim(),
          producerCode: values.producerCode.trim() || null,
          phone: values.phone.trim() || null,
          email: values.email.trim() || null,
          website: values.website.trim() || null,
          notes: values.notes.trim() || null,
          isActive: values.isActive === 'active',
        })
      )}
      noValidate
    >
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="carrier-form-name">Name</FieldLabel>
            <Input id="carrier-form-name" autoFocus {...register('name')} />
            <FieldError errors={errors.name ? [errors.name] : undefined} />
          </Field>
          <Field data-invalid={!!errors.naic}>
            <FieldLabel htmlFor="carrier-form-naic">NAIC</FieldLabel>
            <Input id="carrier-form-naic" {...register('naic')} />
            <FieldError errors={errors.naic ? [errors.naic] : undefined} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.producerCode}>
            <FieldLabel htmlFor="carrier-form-producer-code">Producer code</FieldLabel>
            <Input id="carrier-form-producer-code" {...register('producerCode')} />
            <FieldError errors={errors.producerCode ? [errors.producerCode] : undefined} />
          </Field>
          <Field data-invalid={!!errors.phone}>
            <FieldLabel htmlFor="carrier-form-phone">Phone</FieldLabel>
            <Input id="carrier-form-phone" {...register('phone')} />
            <FieldError errors={errors.phone ? [errors.phone] : undefined} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="carrier-form-email">Email</FieldLabel>
            <Input
              id="carrier-form-email"
              type="email"
              placeholder="service@carrier.example"
              {...register('email')}
            />
            <FieldError errors={errors.email ? [errors.email] : undefined} />
          </Field>
          <Field data-invalid={!!errors.website}>
            <FieldLabel htmlFor="carrier-form-website">Website</FieldLabel>
            <Input
              id="carrier-form-website"
              placeholder="https://carrier.example"
              {...register('website')}
            />
            <FieldError errors={errors.website ? [errors.website] : undefined} />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="carrier-form-status">Status</FieldLabel>
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="carrier-form-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </Field>

        <Field data-invalid={!!errors.notes}>
          <FieldLabel htmlFor="carrier-form-notes">Notes</FieldLabel>
          <Textarea id="carrier-form-notes" rows={3} {...register('notes')} />
          <FieldError errors={errors.notes ? [errors.notes] : undefined} />
        </Field>

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
        <SubmitButton isPending={isPending} pendingLabel={pendingLabel}>
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  )
}
