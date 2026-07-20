import {
  Controller,
  type Control,
  type FieldErrors,
  type FieldValues,
  type Path,
  type PathValue,
  type UseFormRegister,
} from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { US_STATES, type AddressFormValues } from '@/lib/address'

interface AddressFieldsProps<T extends FieldValues> {
  register: UseFormRegister<T>
  control: Control<T>
  errors?: FieldErrors<AddressFormValues>
  name: Path<T>
  idPrefix: string
  disabled?: boolean
}

// Shared address1/address2/city/state/zip fieldset used by the client and
// policy address forms. `name` is the path of the nested Address object
// (e.g. 'mailing', 'policyAddress') within the parent form's values.
export function AddressFields<T extends FieldValues>({
  register,
  control,
  errors,
  name,
  idPrefix,
  disabled,
}: AddressFieldsProps<T>) {
  const fieldPath = (suffix: keyof AddressFormValues) => `${name}.${suffix}` as Path<T>

  return (
    <>
      <Field data-invalid={!!errors?.address1}>
        <FieldLabel htmlFor={`${idPrefix}-address1`}>Address line 1</FieldLabel>
        <Input id={`${idPrefix}-address1`} disabled={disabled} {...register(fieldPath('address1'))} />
        <FieldError errors={errors?.address1 ? [errors.address1] : undefined} />
      </Field>

      <Field data-invalid={!!errors?.address2}>
        <FieldLabel htmlFor={`${idPrefix}-address2`}>Address line 2</FieldLabel>
        <Input id={`${idPrefix}-address2`} disabled={disabled} {...register(fieldPath('address2'))} />
        <FieldError errors={errors?.address2 ? [errors.address2] : undefined} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field data-invalid={!!errors?.city}>
          <FieldLabel htmlFor={`${idPrefix}-city`}>City</FieldLabel>
          <Input id={`${idPrefix}-city`} disabled={disabled} {...register(fieldPath('city'))} />
          <FieldError errors={errors?.city ? [errors.city] : undefined} />
        </Field>

        <Field data-invalid={!!errors?.state}>
          <FieldLabel htmlFor={`${idPrefix}-state`}>State</FieldLabel>
          <Controller
            control={control}
            name={fieldPath('state')}
            render={({ field }) => (
              <Combobox
                id={`${idPrefix}-state`}
                options={US_STATES}
                value={(field.value as string) ?? ''}
                onValueChange={(value) => field.onChange(value as PathValue<T, Path<T>>)}
                placeholder="Select state"
                searchPlaceholder="Search states…"
                emptyText="No states found."
                disabled={disabled}
                aria-invalid={!!errors?.state}
              />
            )}
          />
          <FieldError errors={errors?.state ? [errors.state] : undefined} />
        </Field>

        <Field data-invalid={!!errors?.zip}>
          <FieldLabel htmlFor={`${idPrefix}-zip`}>ZIP</FieldLabel>
          <Input id={`${idPrefix}-zip`} disabled={disabled} {...register(fieldPath('zip'))} />
          <FieldError errors={errors?.zip ? [errors.zip] : undefined} />
        </Field>
      </div>
    </>
  )
}
