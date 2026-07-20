import { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { createClient, type ClientDetail, type CreateClientBody } from '@/api/clients'
import { createPerson, type CreatePersonBody } from '@/api/persons'
import { AddressFields } from '@/components/clients/address-fields'
import {
  addressFormSchema,
  flattenAddress,
  pickAddress,
  toAddressFormValues,
  toNullableAddress,
  type Address,
} from '@/lib/address'

const MARITAL_OPTIONS = ['single', 'married', 'divorced', 'widowed', 'separated'] as const

const clientFormSchema = z.object({
  person: z.object({
    firstName: z.string().trim().min(1, 'First name is required').max(100, 'Max 100 characters'),
    lastName: z.string().trim().min(1, 'Last name is required').max(100, 'Max 100 characters'),
    dateOfBirth: z.iso.date('Enter a valid date'),
    gender: z.enum(['m', 'f', 'other']),
    maritalStatus: z.enum(['none', ...MARITAL_OPTIONS]),
  }),
  mailing: addressFormSchema,
  physical: addressFormSchema,
  phones: z.array(
    z.object({
      value: z.string().trim().min(1, 'Phone number is required').max(20, 'Max 20 characters'),
    })
  ),
  emails: z.array(
    z.object({
      value: z.email('Enter a valid email address').max(255, 'Max 255 characters'),
    })
  ),
})

export type ClientFormValues = z.infer<typeof clientFormSchema>

export interface ClientFormSubmit {
  person: CreatePersonBody
  client: Omit<CreateClientBody, 'namedInsuredId'>
}

const EMPTY_ADDRESS: Address = { address1: null, address2: null, city: null, state: null, zip: null }

function toFormValues(initial?: Omit<ClientDetail, 'policies'>): ClientFormValues {
  return {
    person: {
      firstName: initial?.namedInsured.firstName ?? '',
      lastName: initial?.namedInsured.lastName ?? '',
      dateOfBirth: initial?.namedInsured.dateOfBirth ?? '',
      gender: initial?.namedInsured.gender ?? 'm',
      maritalStatus: initial?.namedInsured.maritalStatus ?? 'none',
    },
    mailing: toAddressFormValues(initial ? pickAddress(initial, 'mailing') : EMPTY_ADDRESS),
    physical: toAddressFormValues(initial ? pickAddress(initial, 'physical') : EMPTY_ADDRESS),
    phones: initial?.phones.map((phone) => ({ value: phone.phoneNumber })) ?? [],
    emails: initial?.emails.map((email) => ({ value: email.email })) ?? [],
  }
}

function toSubmit(
  values: ClientFormValues,
  initial?: Omit<ClientDetail, 'policies'>
): ClientFormSubmit {
  return {
    person: {
      firstName: values.person.firstName.trim(),
      lastName: values.person.lastName.trim(),
      dateOfBirth: values.person.dateOfBirth,
      gender: values.person.gender,
      maritalStatus: values.person.maritalStatus === 'none' ? null : values.person.maritalStatus,
      relationToInsured: initial?.namedInsured.relationToInsured ?? 'self',
    },
    client: {
      ...flattenAddress('mailing', toNullableAddress(values.mailing)),
      ...flattenAddress('physical', toNullableAddress(values.physical)),
      phones: values.phones.map((phone) => phone.value.trim()),
      emails: values.emails.map((email) => email.value.trim()),
    },
  }
}

interface AddClientFormProps {
  initial?: Omit<ClientDetail, 'policies'>
  submitLabel?: string
  onSubmit: (payload: ClientFormSubmit) => void
  onCancel?: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function AddClientForm({
  initial,
  submitLabel = 'Create client',
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: AddClientFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: toFormValues(initial),
  })

  const phoneFields = useFieldArray({ control, name: 'phones' })
  const emailFields = useFieldArray({ control, name: 'emails' })

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(toSubmit(values, initial)))} noValidate>
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Named Insured</FieldLegend>
          <FieldGroup className="gap-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.person?.firstName}>
                <FieldLabel htmlFor="client-form-first-name">First Name</FieldLabel>
                <Input id="client-form-first-name" {...register('person.firstName')} />
                <FieldError
                  errors={errors.person?.firstName ? [errors.person.firstName] : undefined}
                />
              </Field>
              <Field data-invalid={!!errors.person?.lastName}>
                <FieldLabel htmlFor="client-form-last-name">Last Name</FieldLabel>
                <Input id="client-form-last-name" {...register('person.lastName')} />
                <FieldError
                  errors={errors.person?.lastName ? [errors.person.lastName] : undefined}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field data-invalid={!!errors.person?.dateOfBirth}>
                <FieldLabel htmlFor="client-form-dob">Date of Birth</FieldLabel>
                <Input id="client-form-dob" type="date" {...register('person.dateOfBirth')} />
                <FieldError
                  errors={errors.person?.dateOfBirth ? [errors.person.dateOfBirth] : undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-form-gender">Gender</FieldLabel>
                <Controller
                  control={control}
                  name="person.gender"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="client-form-gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="m">Male</SelectItem>
                        <SelectItem value="f">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-form-marital">Marital Status</FieldLabel>
                <Controller
                  control={control}
                  name="person.maritalStatus"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="client-form-marital">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">—</SelectItem>
                        {MARITAL_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option} className="capitalize">
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
            </div>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Mailing Address</FieldLegend>
          <FieldGroup className="gap-3">
            <AddressFields
              register={register}
              control={control}
              errors={errors.mailing}
              name="mailing"
              idPrefix="client-form-mailing"
            />
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Physical Address</FieldLegend>
          <FieldGroup className="gap-3">
            <AddressFields
              register={register}
              control={control}
              errors={errors.physical}
              name="physical"
              idPrefix="client-form-physical"
            />
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Phones</FieldLegend>
          <FieldGroup className="gap-2">
            {phoneFields.fields.map((field, index) => (
              <Field key={field.id} orientation="horizontal">
                <div className="flex-1">
                  <Input
                    aria-label={`Phone ${index + 1}`}
                    {...register(`phones.${index}.value`)}
                  />
                  <FieldError
                    errors={
                      errors.phones?.[index]?.value ? [errors.phones[index]?.value] : undefined
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove phone"
                  onClick={() => phoneFields.remove(index)}
                >
                  <XIcon />
                </Button>
              </Field>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => phoneFields.append({ value: '' })}
            >
              <PlusIcon /> Add phone
            </Button>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Emails</FieldLegend>
          <FieldGroup className="gap-2">
            {emailFields.fields.map((field, index) => (
              <Field key={field.id} orientation="horizontal">
                <div className="flex-1">
                  <Input
                    type="email"
                    aria-label={`Email ${index + 1}`}
                    {...register(`emails.${index}.value`)}
                  />
                  <FieldError
                    errors={
                      errors.emails?.[index]?.value ? [errors.emails[index]?.value] : undefined
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remove email"
                  onClick={() => emailFields.remove(index)}
                >
                  <XIcon />
                </Button>
              </Field>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => emailFields.append({ value: '' })}
            >
              <PlusIcon /> Add email
            </Button>
          </FieldGroup>
        </FieldSet>

        {errorMessage && (
          <div role="alert" className="text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </FieldGroup>

      <DialogFooter className="mt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface AddClientDialogProps {
  onCreated?: (client: ClientDetail) => void
  createPersonFn?: typeof createPerson
  createClientFn?: typeof createClient
}

export function AddClientDialog({
  onCreated,
  createPersonFn = createPerson,
  createClientFn = createClient,
}: AddClientDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (payload: ClientFormSubmit) => {
      // If createClientFn fails here, the person row is orphaned; the user
      // can just retry, which creates a fresh person.
      const person = await createPersonFn(payload.person)
      return createClientFn({ ...payload.client, namedInsuredId: person.id })
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['clients', data.id], data)
      setOpen(false)
      onCreated?.(data)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon /> New Client
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add client</DialogTitle>
          <DialogDescription>Create a client and their named insured.</DialogDescription>
        </DialogHeader>
        <AddClientForm
          onSubmit={(payload) => mutation.mutate(payload)}
          onCancel={() => setOpen(false)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
        />
      </DialogContent>
    </Dialog>
  )
}
