import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldError, FieldGroup, FieldLegend, FieldSet } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateClient, type ClientDetail, type UpdateClientBody } from '@/api/clients'
import { AddressFields } from '@/components/clients/address-fields'
import { addressFormSchema, flattenAddress, pickAddress, toAddressFormValues, toNullableAddress } from '@/lib/address'

const editClientSchema = z.object({
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

export type EditClientFormValues = z.infer<typeof editClientSchema>

function toFormValues(client: Omit<ClientDetail, 'policies'>): EditClientFormValues {
  return {
    mailing: toAddressFormValues(pickAddress(client, 'mailing')),
    physical: toAddressFormValues(pickAddress(client, 'physical')),
    phones: client.phones.map((phone) => ({ value: phone.phoneNumber })),
    emails: client.emails.map((email) => ({ value: email.email })),
  }
}

function toUpdateBody(values: EditClientFormValues): UpdateClientBody {
  return {
    ...flattenAddress('mailing', toNullableAddress(values.mailing)),
    ...flattenAddress('physical', toNullableAddress(values.physical)),
    phones: values.phones.map((phone) => phone.value.trim()),
    emails: values.emails.map((email) => email.value.trim()),
  }
}

interface EditClientFormProps {
  client: Omit<ClientDetail, 'policies'>
  onSubmit: (body: UpdateClientBody) => void
  onCancel?: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function EditClientForm({
  client,
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: EditClientFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EditClientFormValues>({
    resolver: zodResolver(editClientSchema),
    defaultValues: toFormValues(client),
  })

  const phoneFields = useFieldArray({ control, name: 'phones' })
  const emailFields = useFieldArray({ control, name: 'emails' })

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(toUpdateBody(values)))}
      noValidate
    >
      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Mailing Address</FieldLegend>
          <FieldGroup className="gap-3">
            <AddressFields
              register={register}
              control={control}
              errors={errors.mailing}
              name="mailing"
              idPrefix="edit-client-mailing"
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
              idPrefix="edit-client-physical"
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
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface EditClientDialogProps {
  client: Omit<ClientDetail, 'policies'>
  updateClientFn?: typeof updateClient
}

export function EditClientDialog({ client, updateClientFn = updateClient }: EditClientDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (body: UpdateClientBody) => updateClientFn(client.id, body),
    onSuccess: (data) => {
      queryClient.setQueryData(['clients', client.id], data)
      setOpen(false)
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
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>Update addresses and contact info.</DialogDescription>
        </DialogHeader>
        <EditClientForm
          client={client}
          onSubmit={(body) => mutation.mutate(body)}
          onCancel={() => setOpen(false)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
        />
      </DialogContent>
    </Dialog>
  )
}
