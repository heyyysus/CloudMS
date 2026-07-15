import { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ClientDetail, Person } from '@/api/clients'
import {
  createPolicy,
  getCarriers,
  type Carrier,
  type CreatePolicyBody,
  type CreatePolicyDriverBody,
  type PolicyDetail,
  type Vehicle,
} from '@/api/policies'
import { COVERAGE_LABELS } from '@/components/clients/policy-card'
import { AddressFields } from '@/components/clients/address-fields'
import { localTodayIsoDate } from '@/lib/policy-status'
import {
  addressFormSchema,
  flattenAddress,
  isEmptyAddress,
  pickAddress,
  toAddressFormValues,
  toNullableAddress,
  type Address,
} from '@/lib/address'

// A person the client is already associated with (named insured, co-insured,
// or a driver on another policy), offered as a checkable driver row.
export interface ExistingDriverOption {
  personId: number
  person: Person
  driver?: { dlNumber: string | null; rating: string; sr22: boolean }
}

const RELATION_OPTIONS: { value: Person['relationToInsured']; label: string }[] = [
  { value: 'self', label: 'Self' },
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'significant-other', label: 'Significant other' },
  { value: 'other-related', label: 'Other related' },
  { value: 'other', label: 'Other' },
]

const MARITAL_OPTIONS = ['single', 'married', 'divorced', 'widowed', 'separated'] as const

const addPolicySchema = z
  .object({
    carrierId: z.string().min(1, 'Carrier is required'),
    policyNumber: z
      .string()
      .trim()
      .min(1, 'Policy number is required')
      .max(50, 'Max 50 characters'),
    status: z.enum(['pending', 'active', 'cancelled', 'expired']),
    policyAddress: addressFormSchema,
    effectiveDate: z.iso.date('Enter a valid date'),
    term: z.enum(['1', '6', '12']),
    expirationDate: z.iso.date('Enter a valid date'),
    defaultCoverages: z.object({
      bi: z.string(),
      pd: z.string(),
      umbi: z.string(),
      umpd: z.string(),
      medpay: z.string(),
    }),
    vehicles: z.array(
      z.object({
        vin: z.string().trim().min(1, 'VIN is required').max(17, 'Max 17 characters'),
        make: z.string().trim().min(1, 'Make is required').max(100, 'Max 100 characters'),
        model: z.string().trim().min(1, 'Model is required').max(100, 'Max 100 characters'),
        year: z.string().trim().regex(/^\d{4}$/, 'Enter a 4-digit year'),
        garagingZip: z
          .string()
          .trim()
          .min(1, 'Garaging zip is required')
          .max(10, 'Max 10 characters'),
        coll: z.string(),
        comp: z.string(),
        cdw: z.string(),
        rental: z.string(),
        towing: z.string(),
      })
    ),
    existingDrivers: z.array(
      z.object({
        checked: z.boolean(),
        personId: z.number(),
        label: z.string(),
        hasDriverRow: z.boolean(),
        dlNumber: z.string(),
        rating: z.enum(['rated', 'excluded']),
        sr22: z.boolean(),
      })
    ),
    newDrivers: z.array(
      z.object({
        firstName: z.string().trim().min(1, 'First name is required').max(100, 'Max 100 characters'),
        lastName: z.string().trim().min(1, 'Last name is required').max(100, 'Max 100 characters'),
        dateOfBirth: z.iso.date('Enter a valid date'),
        gender: z.enum(['m', 'f', 'other']),
        relationToInsured: z.enum([
          'self',
          'spouse',
          'child',
          'sibling',
          'significant-other',
          'other-related',
          'other',
        ]),
        maritalStatus: z.enum(['none', ...MARITAL_OPTIONS]),
        dlNumber: z.string().trim().min(1, 'DL number is required').max(50, 'Max 50 characters'),
        rating: z.enum(['rated', 'excluded']),
        sr22: z.boolean(),
      })
    ),
  })
  .superRefine((values, ctx) => {
    const vins = new Set<string>()
    values.vehicles.forEach((vehicle, index) => {
      const vin = vehicle.vin.trim().toUpperCase()
      if (vins.has(vin)) {
        ctx.addIssue({
          code: 'custom',
          path: ['vehicles', index, 'vin'],
          message: 'Duplicate VIN on this policy',
        })
      }
      vins.add(vin)
    })
    values.existingDrivers.forEach((driver, index) => {
      if (driver.checked && !driver.hasDriverRow && driver.dlNumber.trim() === '') {
        ctx.addIssue({
          code: 'custom',
          path: ['existingDrivers', index, 'dlNumber'],
          message: 'DL number is required',
        })
      }
    })
  })

export type AddPolicyFormValues = z.infer<typeof addPolicySchema>

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// Month arithmetic on the Y/M/D parts of a YYYY-MM-DD string, clamping the
// day to the target month (Jan 31 + 1 month → Feb 28). Avoids Date-string
// parsing, which is UTC-based and shifts the day in western timezones.
function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const totalMonths = year * 12 + (month - 1) + months
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = totalMonths % 12
  const daysInTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(day, daysInTarget))}`
}

const DEFAULT_TERM = '6'

export type ClientAddressFields = Pick<
  ClientDetail,
  | 'mailingAddress1'
  | 'mailingAddress2'
  | 'mailingCity'
  | 'mailingState'
  | 'mailingZip'
  | 'physicalAddress1'
  | 'physicalAddress2'
  | 'physicalCity'
  | 'physicalState'
  | 'physicalZip'
>

interface ToFormValuesArgs {
  client: ClientAddressFields
  existingDrivers: ExistingDriverOption[]
  initial?: PolicyDetail
}

function defaultPolicyAddress(client: ClientAddressFields, initial?: PolicyDetail): Address {
  if (initial) return pickAddress(initial, 'policy')
  const physical = pickAddress(client, 'physical')
  return isEmptyAddress(physical) ? pickAddress(client, 'mailing') : physical
}

function toFormValues({ client, existingDrivers, initial }: ToFormValuesArgs): AddPolicyFormValues {
  const effectiveDate = initial?.effectiveDate ?? localTodayIsoDate()
  // When editing, the shared coverages come from the first vehicle; the form
  // fans them back out on submit, so per-vehicle differences in those five
  // fields are not preserved.
  const firstVehicle = initial?.vehicles[0]
  const initialDriverPersonIds = new Set(
    initial?.policyDrivers.map((policyDriver) => policyDriver.driver.personId) ?? []
  )

  return {
    carrierId: initial ? String(initial.carrierId) : '',
    policyNumber: initial?.policyNumber ?? '',
    status: initial?.status ?? 'pending',
    policyAddress: toAddressFormValues(defaultPolicyAddress(client, initial)),
    effectiveDate,
    term: DEFAULT_TERM,
    expirationDate: initial?.expirationDate ?? addMonths(effectiveDate, Number(DEFAULT_TERM)),
    defaultCoverages: {
      bi: firstVehicle?.coverageBi ?? '',
      pd: firstVehicle?.coveragePd ?? '',
      umbi: firstVehicle?.coverageUmbi ?? '',
      umpd: firstVehicle?.coverageUmpd ?? '',
      medpay: firstVehicle?.coverageMedpay ?? '',
    },
    vehicles:
      initial?.vehicles.map((vehicle) => ({
        vin: vehicle.vin,
        make: vehicle.make,
        model: vehicle.model,
        year: String(vehicle.year),
        garagingZip: vehicle.garagingZip,
        coll: vehicle.coverageColl ?? '',
        comp: vehicle.coverageComp ?? '',
        cdw: vehicle.coverageCdw ?? '',
        rental: vehicle.coverageRentalReimbursement ?? '',
        towing: vehicle.coverageTowing ?? '',
      })) ?? [],
    existingDrivers: existingDrivers.map((option) => ({
      checked: initialDriverPersonIds.has(option.personId),
      personId: option.personId,
      label: `${option.person.firstName} ${option.person.lastName}`,
      hasDriverRow: !!option.driver,
      dlNumber: option.driver?.dlNumber ?? '',
      rating: option.driver?.rating === 'excluded' ? 'excluded' : 'rated',
      sr22: option.driver?.sr22 ?? false,
    })),
    newDrivers: [],
  }
}

function toBody(values: AddPolicyFormValues, clientId: number): CreatePolicyBody {
  const nullableTrim = (value: string) => {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }

  const drivers: CreatePolicyDriverBody[] = [
    ...values.existingDrivers
      .filter((driver) => driver.checked)
      .map((driver): CreatePolicyDriverBody => {
        if (driver.hasDriverRow) return { kind: 'existing', personId: driver.personId }
        return {
          kind: 'existing',
          personId: driver.personId,
          dlNumber: driver.dlNumber.trim(),
          rating: driver.rating,
          sr22: driver.sr22,
        }
      }),
    ...values.newDrivers.map(
      (driver): CreatePolicyDriverBody => ({
        kind: 'new',
        person: {
          firstName: driver.firstName.trim(),
          lastName: driver.lastName.trim(),
          dateOfBirth: driver.dateOfBirth,
          gender: driver.gender,
          relationToInsured: driver.relationToInsured,
          maritalStatus: driver.maritalStatus === 'none' ? undefined : driver.maritalStatus,
        },
        dlNumber: driver.dlNumber.trim(),
        rating: driver.rating,
        sr22: driver.sr22,
      })
    ),
  ]

  return {
    clientId,
    carrierId: Number(values.carrierId),
    policyNumber: values.policyNumber.trim(),
    ...flattenAddress('policy', toNullableAddress(values.policyAddress)),
    effectiveDate: values.effectiveDate,
    expirationDate: values.expirationDate,
    status: values.status,
    vehicles: values.vehicles.map((vehicle) => ({
      vin: vehicle.vin.trim().toUpperCase(),
      make: vehicle.make.trim(),
      model: vehicle.model.trim(),
      year: Number(vehicle.year),
      garagingZip: vehicle.garagingZip.trim(),
      // shared policy-level coverages fan out to every vehicle
      coverageBi: nullableTrim(values.defaultCoverages.bi),
      coveragePd: nullableTrim(values.defaultCoverages.pd),
      coverageUmbi: nullableTrim(values.defaultCoverages.umbi),
      coverageUmpd: nullableTrim(values.defaultCoverages.umpd),
      coverageMedpay: nullableTrim(values.defaultCoverages.medpay),
      coverageColl: nullableTrim(vehicle.coll),
      coverageComp: nullableTrim(vehicle.comp),
      coverageCdw: nullableTrim(vehicle.cdw),
      coverageRentalReimbursement: nullableTrim(vehicle.rental),
      coverageTowing: nullableTrim(vehicle.towing),
    })),
    drivers,
  }
}

const EMPTY_VEHICLE_ROW = {
  vin: '',
  make: '',
  model: '',
  year: '',
  garagingZip: '',
  coll: '',
  comp: '',
  cdw: '',
  rental: '',
  towing: '',
}

interface AddPolicyFormProps {
  clientId: number
  client: ClientAddressFields
  carriers: Carrier[]
  carriersLoading?: boolean
  existingVehicles: Vehicle[]
  existingDrivers: ExistingDriverOption[]
  initial?: PolicyDetail
  submitLabel?: string
  onSubmit: (body: CreatePolicyBody) => void
  onCancel?: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function AddPolicyForm({
  clientId,
  client,
  carriers,
  carriersLoading,
  existingVehicles,
  existingDrivers,
  initial,
  submitLabel = 'Create policy',
  onSubmit,
  onCancel,
  isPending,
  errorMessage,
}: AddPolicyFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
  } = useForm<AddPolicyFormValues>({
    resolver: zodResolver(addPolicySchema),
    defaultValues: toFormValues({ client, existingDrivers, initial }),
  })

  const vehicleFields = useFieldArray({ control, name: 'vehicles' })
  const existingDriverFields = useFieldArray({ control, name: 'existingDrivers' })
  const newDriverFields = useFieldArray({ control, name: 'newDrivers' })
  const watchedExistingDrivers = watch('existingDrivers')

  const syncExpiration = (effectiveDate: string, term: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      setValue('expirationDate', addMonths(effectiveDate, Number(term)))
    }
  }

  const setAddress = (value: Address) => {
    setValue('policyAddress', toAddressFormValues(value))
  }

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(toBody(values, clientId)))} noValidate>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.carrierId}>
            <FieldLabel htmlFor="add-policy-carrier">Carrier</FieldLabel>
            <Controller
              control={control}
              name="carrierId"
              render={({ field }) => (
                <Combobox
                  id="add-policy-carrier"
                  options={carriers.map((carrier) => ({
                    value: String(carrier.id),
                    label: carrier.name,
                  }))}
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={carriersLoading ? 'Loading carriers…' : 'Select carrier'}
                  searchPlaceholder="Search carriers…"
                  emptyText="No carriers found."
                  disabled={carriersLoading}
                  aria-invalid={!!errors.carrierId}
                />
              )}
            />
            <FieldError errors={errors.carrierId ? [errors.carrierId] : undefined} />
          </Field>

          <Field data-invalid={!!errors.policyNumber}>
            <FieldLabel htmlFor="add-policy-number">Policy Number</FieldLabel>
            <Input id="add-policy-number" {...register('policyNumber')} />
            <FieldError errors={errors.policyNumber ? [errors.policyNumber] : undefined} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.effectiveDate}>
            <FieldLabel htmlFor="add-policy-effective">Effective Date</FieldLabel>
            <Input
              id="add-policy-effective"
              type="date"
              {...register('effectiveDate', {
                onChange: (event) => syncExpiration(event.target.value, getValues('term')),
              })}
            />
            <FieldError errors={errors.effectiveDate ? [errors.effectiveDate] : undefined} />
          </Field>

          <Field>
            <FieldLabel htmlFor="add-policy-term">Term</FieldLabel>
            <Controller
              control={control}
              name="term"
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    field.onChange(value)
                    syncExpiration(getValues('effectiveDate'), value)
                  }}
                >
                  <SelectTrigger id="add-policy-term">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 month</SelectItem>
                    <SelectItem value="6">6 months</SelectItem>
                    <SelectItem value="12">12 months</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={!!errors.expirationDate}>
            <FieldLabel htmlFor="add-policy-expiration">Expiration Date</FieldLabel>
            <Input id="add-policy-expiration" type="date" {...register('expirationDate')} />
            <FieldError errors={errors.expirationDate ? [errors.expirationDate] : undefined} />
          </Field>

          <Field>
            <FieldLabel htmlFor="add-policy-status">Status</FieldLabel>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="add-policy-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">Policy Address</FieldLegend>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isEmptyAddress(pickAddress(client, 'physical'))}
              onClick={() => setAddress(pickAddress(client, 'physical'))}
            >
              Use physical
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isEmptyAddress(pickAddress(client, 'mailing'))}
              onClick={() => setAddress(pickAddress(client, 'mailing'))}
            >
              Use mailing
            </Button>
          </div>
          <FieldGroup className="gap-3">
            <AddressFields
              register={register}
              control={control}
              errors={errors.policyAddress}
              name="policyAddress"
              idPrefix="add-policy-address"
            />
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Coverage</FieldLegend>
          <FieldDescription>Applied to every vehicle on the policy.</FieldDescription>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Field>
              <FieldLabel htmlFor="add-policy-coverage-bi">{COVERAGE_LABELS.coverageBi}</FieldLabel>
              <Input id="add-policy-coverage-bi" {...register('defaultCoverages.bi')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-policy-coverage-pd">{COVERAGE_LABELS.coveragePd}</FieldLabel>
              <Input id="add-policy-coverage-pd" {...register('defaultCoverages.pd')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-policy-coverage-umbi">
                {COVERAGE_LABELS.coverageUmbi}
              </FieldLabel>
              <Input id="add-policy-coverage-umbi" {...register('defaultCoverages.umbi')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-policy-coverage-umpd">
                {COVERAGE_LABELS.coverageUmpd}
              </FieldLabel>
              <Input id="add-policy-coverage-umpd" {...register('defaultCoverages.umpd')} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-policy-coverage-medpay">
                {COVERAGE_LABELS.coverageMedpay}
              </FieldLabel>
              <Input id="add-policy-coverage-medpay" {...register('defaultCoverages.medpay')} />
            </Field>
          </div>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Vehicles</FieldLegend>
          {existingVehicles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {existingVehicles.map((vehicle) => (
                <Button
                  key={vehicle.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    vehicleFields.append({
                      vin: vehicle.vin,
                      make: vehicle.make,
                      model: vehicle.model,
                      year: String(vehicle.year),
                      garagingZip: vehicle.garagingZip,
                      coll: vehicle.coverageColl ?? '',
                      comp: vehicle.coverageComp ?? '',
                      cdw: vehicle.coverageCdw ?? '',
                      rental: vehicle.coverageRentalReimbursement ?? '',
                      towing: vehicle.coverageTowing ?? '',
                    })
                  }
                >
                  <PlusIcon /> {vehicle.year} {vehicle.make} {vehicle.model} — {vehicle.vin}
                </Button>
              ))}
            </div>
          )}
          <FieldGroup className="gap-3">
            {vehicleFields.fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Vehicle {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove vehicle ${index + 1}`}
                    onClick={() => vehicleFields.remove(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field data-invalid={!!errors.vehicles?.[index]?.vin}>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-vin`}>VIN</FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-vin`}
                      {...register(`vehicles.${index}.vin`)}
                    />
                    <FieldError
                      errors={
                        errors.vehicles?.[index]?.vin ? [errors.vehicles[index]?.vin] : undefined
                      }
                    />
                  </Field>
                  <Field data-invalid={!!errors.vehicles?.[index]?.year}>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-year`}>Year</FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-year`}
                      inputMode="numeric"
                      {...register(`vehicles.${index}.year`)}
                    />
                    <FieldError
                      errors={
                        errors.vehicles?.[index]?.year ? [errors.vehicles[index]?.year] : undefined
                      }
                    />
                  </Field>
                  <Field data-invalid={!!errors.vehicles?.[index]?.make}>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-make`}>Make</FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-make`}
                      {...register(`vehicles.${index}.make`)}
                    />
                    <FieldError
                      errors={
                        errors.vehicles?.[index]?.make ? [errors.vehicles[index]?.make] : undefined
                      }
                    />
                  </Field>
                  <Field data-invalid={!!errors.vehicles?.[index]?.model}>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-model`}>Model</FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-model`}
                      {...register(`vehicles.${index}.model`)}
                    />
                    <FieldError
                      errors={
                        errors.vehicles?.[index]?.model
                          ? [errors.vehicles[index]?.model]
                          : undefined
                      }
                    />
                  </Field>
                  <Field data-invalid={!!errors.vehicles?.[index]?.garagingZip}>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-zip`}>
                      Garaging Zip
                    </FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-zip`}
                      {...register(`vehicles.${index}.garagingZip`)}
                    />
                    <FieldError
                      errors={
                        errors.vehicles?.[index]?.garagingZip
                          ? [errors.vehicles[index]?.garagingZip]
                          : undefined
                      }
                    />
                  </Field>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Field>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-coll`}>
                      {COVERAGE_LABELS.coverageColl}
                    </FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-coll`}
                      {...register(`vehicles.${index}.coll`)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-comp`}>
                      {COVERAGE_LABELS.coverageComp}
                    </FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-comp`}
                      {...register(`vehicles.${index}.comp`)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-cdw`}>
                      {COVERAGE_LABELS.coverageCdw}
                    </FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-cdw`}
                      {...register(`vehicles.${index}.cdw`)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-rental`}>
                      {COVERAGE_LABELS.coverageRentalReimbursement}
                    </FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-rental`}
                      {...register(`vehicles.${index}.rental`)}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`add-policy-vehicle-${index}-towing`}>
                      {COVERAGE_LABELS.coverageTowing}
                    </FieldLabel>
                    <Input
                      id={`add-policy-vehicle-${index}-towing`}
                      {...register(`vehicles.${index}.towing`)}
                    />
                  </Field>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => vehicleFields.append({ ...EMPTY_VEHICLE_ROW })}
            >
              <PlusIcon /> Add vehicle
            </Button>
          </FieldGroup>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Drivers</FieldLegend>
          {existingDriverFields.fields.length > 0 && (
            <FieldGroup className="gap-2">
              {existingDriverFields.fields.map((field, index) => {
                const row = watchedExistingDrivers?.[index]
                return (
                  <div key={field.id} className="rounded-lg border p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        {...register(`existingDrivers.${index}.checked`)}
                      />
                      <span>{field.label}</span>
                      {field.hasDriverRow && field.dlNumber && (
                        <span className="text-xs text-muted-foreground">DL {field.dlNumber}</span>
                      )}
                    </label>
                    {row?.checked && !field.hasDriverRow && (
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <Field data-invalid={!!errors.existingDrivers?.[index]?.dlNumber}>
                          <FieldLabel htmlFor={`add-policy-existing-driver-${index}-dl`}>
                            DL Number
                          </FieldLabel>
                          <Input
                            id={`add-policy-existing-driver-${index}-dl`}
                            {...register(`existingDrivers.${index}.dlNumber`)}
                          />
                          <FieldError
                            errors={
                              errors.existingDrivers?.[index]?.dlNumber
                                ? [errors.existingDrivers[index]?.dlNumber]
                                : undefined
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor={`add-policy-existing-driver-${index}-rating`}>
                            Rating
                          </FieldLabel>
                          <Controller
                            control={control}
                            name={`existingDrivers.${index}.rating`}
                            render={({ field: ratingField }) => (
                              <Select
                                value={ratingField.value}
                                onValueChange={ratingField.onChange}
                              >
                                <SelectTrigger id={`add-policy-existing-driver-${index}-rating`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="rated">Rated</SelectItem>
                                  <SelectItem value="excluded">Excluded</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        </Field>
                        <Field orientation="horizontal" className="sm:pt-6">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              {...register(`existingDrivers.${index}.sr22`)}
                            />
                            SR-22
                          </label>
                        </Field>
                      </div>
                    )}
                  </div>
                )
              })}
            </FieldGroup>
          )}
          <FieldGroup className="gap-3">
            {newDriverFields.fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">New driver {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove new driver ${index + 1}`}
                    onClick={() => newDriverFields.remove(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field data-invalid={!!errors.newDrivers?.[index]?.firstName}>
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-first`}>
                      First Name
                    </FieldLabel>
                    <Input
                      id={`add-policy-new-driver-${index}-first`}
                      {...register(`newDrivers.${index}.firstName`)}
                    />
                    <FieldError
                      errors={
                        errors.newDrivers?.[index]?.firstName
                          ? [errors.newDrivers[index]?.firstName]
                          : undefined
                      }
                    />
                  </Field>
                  <Field data-invalid={!!errors.newDrivers?.[index]?.lastName}>
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-last`}>
                      Last Name
                    </FieldLabel>
                    <Input
                      id={`add-policy-new-driver-${index}-last`}
                      {...register(`newDrivers.${index}.lastName`)}
                    />
                    <FieldError
                      errors={
                        errors.newDrivers?.[index]?.lastName
                          ? [errors.newDrivers[index]?.lastName]
                          : undefined
                      }
                    />
                  </Field>
                  <Field data-invalid={!!errors.newDrivers?.[index]?.dateOfBirth}>
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-dob`}>
                      Date of Birth
                    </FieldLabel>
                    <Input
                      id={`add-policy-new-driver-${index}-dob`}
                      type="date"
                      {...register(`newDrivers.${index}.dateOfBirth`)}
                    />
                    <FieldError
                      errors={
                        errors.newDrivers?.[index]?.dateOfBirth
                          ? [errors.newDrivers[index]?.dateOfBirth]
                          : undefined
                      }
                    />
                  </Field>
                  <Field data-invalid={!!errors.newDrivers?.[index]?.dlNumber}>
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-dl`}>
                      DL Number
                    </FieldLabel>
                    <Input
                      id={`add-policy-new-driver-${index}-dl`}
                      {...register(`newDrivers.${index}.dlNumber`)}
                    />
                    <FieldError
                      errors={
                        errors.newDrivers?.[index]?.dlNumber
                          ? [errors.newDrivers[index]?.dlNumber]
                          : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-gender`}>
                      Gender
                    </FieldLabel>
                    <Controller
                      control={control}
                      name={`newDrivers.${index}.gender`}
                      render={({ field: genderField }) => (
                        <Select value={genderField.value} onValueChange={genderField.onChange}>
                          <SelectTrigger id={`add-policy-new-driver-${index}-gender`}>
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
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-relation`}>
                      Relation to Insured
                    </FieldLabel>
                    <Controller
                      control={control}
                      name={`newDrivers.${index}.relationToInsured`}
                      render={({ field: relationField }) => (
                        <Select value={relationField.value} onValueChange={relationField.onChange}>
                          <SelectTrigger id={`add-policy-new-driver-${index}-relation`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RELATION_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-marital`}>
                      Marital Status
                    </FieldLabel>
                    <Controller
                      control={control}
                      name={`newDrivers.${index}.maritalStatus`}
                      render={({ field: maritalField }) => (
                        <Select value={maritalField.value} onValueChange={maritalField.onChange}>
                          <SelectTrigger id={`add-policy-new-driver-${index}-marital`}>
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
                  <Field>
                    <FieldLabel htmlFor={`add-policy-new-driver-${index}-rating`}>
                      Rating
                    </FieldLabel>
                    <Controller
                      control={control}
                      name={`newDrivers.${index}.rating`}
                      render={({ field: ratingField }) => (
                        <Select value={ratingField.value} onValueChange={ratingField.onChange}>
                          <SelectTrigger id={`add-policy-new-driver-${index}-rating`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rated">Rated</SelectItem>
                            <SelectItem value="excluded">Excluded</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </Field>
                  <Field orientation="horizontal">
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" {...register(`newDrivers.${index}.sr22`)} />
                      SR-22
                    </label>
                  </Field>
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                newDriverFields.append({
                  firstName: '',
                  lastName: '',
                  dateOfBirth: '',
                  gender: 'm',
                  relationToInsured: 'other',
                  maritalStatus: 'none',
                  dlNumber: '',
                  rating: 'rated',
                  sr22: false,
                })
              }
            >
              <PlusIcon /> Add driver
            </Button>
          </FieldGroup>
        </FieldSet>

        {errorMessage && (
          <div role="alert" className="text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </FieldGroup>

      <DialogFooter>
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

interface AddPolicyDialogProps {
  client: ClientDetail
  existingVehicles: Vehicle[]
  existingDrivers: ExistingDriverOption[]
  createPolicyFn?: typeof createPolicy
  getCarriersFn?: typeof getCarriers
}

export function AddPolicyDialog({
  client,
  existingVehicles,
  existingDrivers,
  createPolicyFn = createPolicy,
  getCarriersFn = getCarriers,
}: AddPolicyDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const carriersQuery = useQuery({
    queryKey: ['carriers'],
    queryFn: ({ signal }) => getCarriersFn(signal),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (body: CreatePolicyBody) => createPolicyFn(body),
    onSuccess: (data) => {
      queryClient.setQueryData(['policies', data.id], data)
      queryClient.setQueryData<ClientDetail>(['clients', client.id], (old) =>
        old ? { ...old, policies: [...old.policies, data] } : old
      )
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
        <Button size="sm">
          <PlusIcon /> Add Policy
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add policy</DialogTitle>
          <DialogDescription>
            Create a new auto policy with its vehicles and drivers.
          </DialogDescription>
        </DialogHeader>
        <AddPolicyForm
          clientId={client.id}
          client={client}
          carriers={carriersQuery.data ?? []}
          carriersLoading={carriersQuery.isPending}
          existingVehicles={existingVehicles}
          existingDrivers={existingDrivers}
          onSubmit={(body) => mutation.mutate(body)}
          onCancel={() => setOpen(false)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
        />
      </DialogContent>
    </Dialog>
  )
}
