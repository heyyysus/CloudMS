import { useState } from 'react'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Field,
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
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { centsToDecimalString, formatMoney, moneyAmountSchema, toCents } from '@/lib/money'
import {
  INVOICE_ITEM_TYPE_LABEL,
  INVOICE_ITEM_TYPE_OPTIONS,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TEXT_CLASS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHOD_OPTIONS,
  categoryForItemType,
} from '@/lib/invoice-options'
import type { ClientDetail } from '@/api/clients'
import {
  amountDueCents,
  createInvoice,
  getInvoices,
  type CreateInvoiceBody,
  type Invoice,
  type InvoiceStatus,
  type PaymentMethod,
} from '@/api/invoices'
import { recordPayment, type ReceiptDetail } from '@/api/payments'

const INVOICE_ITEM_TYPE_VALUES = [
  'new_business_sweep',
  'installment_payment_sweep',
  'endorsement_sweep',
  'new_business_fee',
  'installment_payment_fee',
  'endorsement_fee',
] as const

const PAYMENT_METHOD_VALUES = ['cash', 'check', 'credit_card', 'debit_card'] as const

// --- Shared payment-row schema/values, used by both the "build new invoice"
// and "pay existing invoice" forms below. -----------------------------------

const paymentRowFormSchema = z.object({
  method: z.enum(PAYMENT_METHOD_VALUES),
  amount: moneyAmountSchema,
  note: z.string().trim().max(2000, 'Max 2000 characters'),
})

type PaymentRowFormValues = z.infer<typeof paymentRowFormSchema>

function emptyPaymentRow(amount = ''): PaymentRowFormValues {
  return { method: 'cash', amount, note: '' }
}

interface PaymentRowInput {
  method: PaymentMethod
  amount: string
  note: string | null
}

function toPaymentInputs(rows: PaymentRowFormValues[]): PaymentRowInput[] {
  return rows.map((row) => ({
    method: row.method,
    amount: row.amount,
    note: row.note.trim() || null,
  }))
}


// --- Step 1: choose between paying an open invoice or creating a new one. --

interface InvoiceChoiceStepProps {
  isLoading: boolean
  isError: boolean
  openInvoices: Invoice[]
  onPay: (invoiceId: number) => void
  onCreateNew: () => void
  onCancel: () => void
}

function InvoiceChoiceStep({
  isLoading,
  isError,
  openInvoices,
  onPay,
  onCreateNew,
  onCancel,
}: InvoiceChoiceStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New invoice or payment</DialogTitle>
        <DialogDescription>
          This client has open invoices. Pay one of them, or create a new invoice.
        </DialogDescription>
      </DialogHeader>

      {isError && <p className="text-sm text-destructive">Failed to load invoices.</p>}
      {isLoading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      )}
      {!isLoading && !isError && (
        <div className="flex flex-col gap-2">
          {openInvoices.map((invoice) => (
            <Button
              key={invoice.id}
              type="button"
              variant="outline"
              className="h-auto justify-between py-2"
              onClick={() => onPay(invoice.id)}
            >
              <span>Invoice #{invoice.id}</span>
              <span className="text-muted-foreground">
                {formatMoney(amountDueCents(invoice) / 100)} due
              </span>
            </Button>
          ))}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={onCreateNew}>
          <PlusIcon /> Create a new invoice
        </Button>
      </DialogFooter>
    </div>
  )
}

// --- Step 2a: build a new invoice, optionally with payments. --------------

const lineItemFormSchema = z.object({
  type: z.enum(INVOICE_ITEM_TYPE_VALUES),
  amount: moneyAmountSchema,
})

const buildFormSchema = z.object({
  note: z.string().trim().max(2000, 'Max 2000 characters'),
  items: z.array(lineItemFormSchema).min(1, 'Add at least one line item'),
  payments: z.array(paymentRowFormSchema),
})

type BuildFormValues = z.infer<typeof buildFormSchema>

function emptyLineItem(): BuildFormValues['items'][number] {
  return { type: 'new_business_sweep', amount: '' }
}

// Carrier is never user-selected - the server defaults a sweep item's carrier
// to the policy's own carrier whenever carrierId is null.
function toCreateInvoiceBody(policyId: number, values: BuildFormValues): CreateInvoiceBody {
  return {
    policyId,
    note: values.note.trim() || null,
    items: values.items.map((item) => ({
      category: categoryForItemType(item.type),
      type: item.type,
      carrierId: null,
      description: null,
      amount: item.amount,
    })),
  }
}

interface NewInvoiceFormProps {
  policy: { id: number; policyNumber: string }
  onSubmit: (body: CreateInvoiceBody, payments: PaymentRowInput[]) => void
  onCancel: () => void
  onBack?: () => void
  isPending?: boolean
  errorMessage?: string | null
}

function NewInvoiceForm({
  policy,
  onSubmit,
  onCancel,
  onBack,
  isPending,
  errorMessage,
}: NewInvoiceFormProps) {
  const {
    control,
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<BuildFormValues>({
    resolver: zodResolver(buildFormSchema),
    defaultValues: {
      note: '',
      items: [emptyLineItem()],
      payments: [],
    },
  })

  const itemFields = useFieldArray({ control, name: 'items' })
  const paymentFields = useFieldArray({ control, name: 'payments' })
  const watchedItems = watch('items')
  const totalCents = watchedItems.reduce(
    (sum, item) => sum + (Number(item.amount) > 0 ? toCents(item.amount) : 0),
    0
  )

  return (
    <form
      onSubmit={handleSubmit((values) =>
        onSubmit(toCreateInvoiceBody(policy.id, values), toPaymentInputs(values.payments))
      )}
      noValidate
    >
      <DialogHeader>
        <DialogTitle>Create invoice</DialogTitle>
        <DialogDescription>
          Add line items for the policy-scoped invoice, and optionally record payments against
          it.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup className="mt-4 gap-4">
        <Field>
          <FieldLabel>Policy</FieldLabel>
          <p className="text-sm">{policy.policyNumber}</p>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Line items</FieldLegend>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="flex-1">Type</span>
            <span className="w-32 shrink-0">Amount</span>
            <span className="w-7 shrink-0" />
          </div>
          <FieldGroup className="gap-2">
            {itemFields.fields.map((field, index) => (
              <div key={field.id}>
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name={`items.${index}.type`}
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger
                          aria-label={`Line ${index + 1} type`}
                          aria-invalid={!!errors.items?.[index]?.type}
                          className="flex-1"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVOICE_ITEM_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <InputGroup className="w-32 shrink-0">
                    <InputGroupAddon>$</InputGroupAddon>
                    <InputGroupInput
                      aria-label={`Line ${index + 1} amount`}
                      aria-invalid={!!errors.items?.[index]?.amount}
                      inputMode="decimal"
                      {...register(`items.${index}.amount`)}
                    />
                  </InputGroup>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() => itemFields.remove(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <FieldError
                  errors={
                    errors.items?.[index]?.type
                      ? [errors.items[index]?.type]
                      : errors.items?.[index]?.amount
                        ? [errors.items[index]?.amount]
                        : undefined
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => itemFields.append(emptyLineItem())}
            >
              <PlusIcon /> Add line
            </Button>
          </FieldGroup>
          <FieldError errors={errors.items?.root ? [errors.items.root] : errors.items?.message ? [{ message: errors.items.message }] : undefined} />
          <p className="text-sm font-medium">Total: {formatMoney(totalCents / 100)}</p>
        </FieldSet>

        <FieldSet>
          <FieldLegend variant="label">Payments (optional)</FieldLegend>
          {paymentFields.fields.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="w-32 shrink-0">Method</span>
              <span className="flex-1">Note</span>
              <span className="w-32 shrink-0">Amount</span>
              <span className="w-7 shrink-0" />
            </div>
          )}
          <FieldGroup className="gap-2">
            {paymentFields.fields.map((field, index) => (
              <div key={field.id}>
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name={`payments.${index}.method`}
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger aria-label={`Payment ${index + 1} method`} className="w-32 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Input
                    aria-label={`Payment ${index + 1} note`}
                    placeholder="Note (optional)"
                    className="flex-1"
                    {...register(`payments.${index}.note`)}
                  />
                  <InputGroup className="w-32 shrink-0">
                    <InputGroupAddon>$</InputGroupAddon>
                    <InputGroupInput
                      aria-label={`Payment ${index + 1} amount`}
                      aria-invalid={!!errors.payments?.[index]?.amount}
                      inputMode="decimal"
                      {...register(`payments.${index}.amount`)}
                    />
                  </InputGroup>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove payment ${index + 1}`}
                    onClick={() => paymentFields.remove(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <FieldError
                  errors={
                    errors.payments?.[index]?.amount ? [errors.payments[index]?.amount] : undefined
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => paymentFields.append(emptyPaymentRow())}
            >
              <PlusIcon /> Add payment
            </Button>
          </FieldGroup>
        </FieldSet>

        <div className="flex justify-end">
          <Field className="w-full sm:w-72">
            <FieldLabel htmlFor="invoice-note">Note (optional)</FieldLabel>
            <Input id="invoice-note" {...register('note')} />
          </Field>
        </div>

        {errorMessage && (
          <div role="alert" className="text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </FieldGroup>

      <DialogFooter className="mt-4">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Create invoice'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// --- Step 2b: pay an existing open invoice. --------------------------------

const payFormSchema = z.object({
  payments: z.array(paymentRowFormSchema).min(1, 'Add at least one payment'),
})

type PayFormValues = z.infer<typeof payFormSchema>

interface PayInvoiceFormProps {
  invoice: Invoice
  onSubmit: (payments: PaymentRowInput[]) => void
  onCancel: () => void
  onBack?: () => void
  isPending?: boolean
  errorMessage?: string | null
}

function PayInvoiceForm({
  invoice,
  onSubmit,
  onCancel,
  onBack,
  isPending,
  errorMessage,
}: PayInvoiceFormProps) {
  const dueCents = amountDueCents(invoice)
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PayFormValues>({
    resolver: zodResolver(payFormSchema),
    defaultValues: { payments: [emptyPaymentRow(centsToDecimalString(Math.max(dueCents, 0)))] },
  })

  const paymentFields = useFieldArray({ control, name: 'payments' })

  return (
    <form onSubmit={handleSubmit((values) => onSubmit(toPaymentInputs(values.payments)))} noValidate>
      <DialogHeader>
        <DialogTitle>Pay invoice #{invoice.id}</DialogTitle>
        <DialogDescription>Record one or more payments against this invoice.</DialogDescription>
      </DialogHeader>

      <FieldGroup className="mt-4 gap-4">
        <div className="rounded-lg border p-3 text-sm">
          {invoice.items.map((item) => (
            <div key={item.id} className="flex items-center justify-between text-muted-foreground">
              <span>
                {INVOICE_ITEM_TYPE_LABEL[item.type]}
                {item.carrier ? ` — ${item.carrier.name}` : ''}
              </span>
              <span>{formatMoney(item.amount)}</span>
            </div>
          ))}
          <Separator className="my-2" />
          <div className="flex items-center justify-between font-medium">
            <span>Amount due</span>
            <span>{formatMoney(dueCents / 100)}</span>
          </div>
        </div>

        <FieldSet>
          <FieldLegend variant="label">Payments</FieldLegend>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="w-32 shrink-0">Method</span>
            <span className="flex-1">Note</span>
            <span className="w-32 shrink-0">Amount</span>
            <span className="w-7 shrink-0" />
          </div>
          <FieldGroup className="gap-2">
            {paymentFields.fields.map((field, index) => (
              <div key={field.id}>
                <div className="flex items-center gap-2">
                  <Controller
                    control={control}
                    name={`payments.${index}.method`}
                    render={({ field: f }) => (
                      <Select value={f.value} onValueChange={f.onChange}>
                        <SelectTrigger aria-label={`Payment ${index + 1} method`} className="w-32 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHOD_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <Input
                    aria-label={`Payment ${index + 1} note`}
                    placeholder="Note (optional)"
                    className="flex-1"
                    {...register(`payments.${index}.note`)}
                  />
                  <InputGroup className="w-32 shrink-0">
                    <InputGroupAddon>$</InputGroupAddon>
                    <InputGroupInput
                      aria-label={`Payment ${index + 1} amount`}
                      aria-invalid={!!errors.payments?.[index]?.amount}
                      inputMode="decimal"
                      {...register(`payments.${index}.amount`)}
                    />
                  </InputGroup>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove payment ${index + 1}`}
                    onClick={() => paymentFields.remove(index)}
                  >
                    <XIcon />
                  </Button>
                </div>
                <FieldError
                  errors={
                    errors.payments?.[index]?.amount ? [errors.payments[index]?.amount] : undefined
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => paymentFields.append(emptyPaymentRow())}
            >
              <PlusIcon /> Add payment
            </Button>
          </FieldGroup>
          <FieldError
            errors={
              errors.payments?.root
                ? [errors.payments.root]
                : errors.payments?.message
                  ? [{ message: errors.payments.message }]
                  : undefined
            }
          />
        </FieldSet>

        {errorMessage && (
          <div role="alert" className="text-sm text-destructive">
            {errorMessage}
          </div>
        )}
      </FieldGroup>

      <DialogFooter className="mt-4">
        {onBack && (
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Record payment'}
        </Button>
      </DialogFooter>
    </form>
  )
}

// --- Step 3: result summary. -----------------------------------------------

interface SubmitResult {
  invoiceId: number
  finalStatus: InvoiceStatus
  invoiceTotal: string | null
  receipts: ReceiptDetail[]
  skippedPayments: PaymentRowInput[]
}

function ResultSummary({ result, onClose }: { result: SubmitResult; onClose: () => void }) {
  const totalChangeCents = result.receipts.reduce((sum, r) => sum + toCents(r.changeGiven), 0)
  const lastReceipt = result.receipts.at(-1)

  return (
    <div className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Invoice #{result.invoiceId}</DialogTitle>
        <DialogDescription>
          <span className={cn('font-medium capitalize', INVOICE_STATUS_TEXT_CLASS[result.finalStatus])}>
            {INVOICE_STATUS_LABEL[result.finalStatus]}
          </span>
        </DialogDescription>
      </DialogHeader>

      {result.receipts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No payments recorded.
          {result.invoiceTotal && ` ${formatMoney(result.invoiceTotal)} due.`}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {result.receipts.map((receipt) => (
            <div key={receipt.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span>{PAYMENT_METHOD_LABEL[receipt.payment.method]}</span>
                <span>{formatMoney(receipt.amountApplied)} applied</span>
              </div>
              {toCents(receipt.changeGiven) > 0 && (
                <p className="mt-1 text-warning">Change given: {formatMoney(receipt.changeGiven)}</p>
              )}
            </div>
          ))}
          {totalChangeCents > 0 && (
            <div className="rounded-lg border-2 border-warning bg-warning/10 p-3 text-center">
              <p className="text-xs font-medium text-muted-foreground">Total change to hand back</p>
              <p className="text-lg font-semibold text-warning">
                {formatMoney(totalChangeCents / 100)}
              </p>
            </div>
          )}
          {lastReceipt && (
            <p className="text-sm text-muted-foreground">
              Amount due after: {formatMoney(lastReceipt.amountDueAfter)}
            </p>
          )}
        </div>
      )}

      {result.skippedPayments.length > 0 && (
        <p className="text-sm text-warning">
          {result.skippedPayments.length} payment(s) were not recorded because the invoice was
          already paid in full.
        </p>
      )}

      <DialogFooter>
        <Button type="button" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </div>
  )
}

// --- Container. --------------------------------------------------------

type Step = 'choose' | 'build' | 'pay'

type SubmitInput =
  | { kind: 'create'; body: CreateInvoiceBody; payments: PaymentRowInput[] }
  | { kind: 'pay'; invoiceId: number; payments: PaymentRowInput[] }

interface InvoicePaymentDialogProps {
  client: Pick<ClientDetail, 'id'>
  // The policy a new invoice is created against - always the one currently
  // being viewed, never user-selected (see PolicyTabs' selection in
  // ClientDetail). Only needed to build a new invoice, not to pay one.
  policy: { id: number; policyNumber: string }
  open: boolean
  onOpenChange: (open: boolean) => void
  // Pre-targets a specific invoice (opened via a "Pay" button elsewhere),
  // skipping the choose step.
  initialInvoiceId?: number
  createInvoiceFn?: typeof createInvoice
  recordPaymentFn?: typeof recordPayment
  getInvoicesFn?: typeof getInvoices
}

export function InvoicePaymentDialog({
  client,
  policy,
  open,
  onOpenChange,
  initialInvoiceId,
  createInvoiceFn = createInvoice,
  recordPaymentFn = recordPayment,
  getInvoicesFn = getInvoices,
}: InvoicePaymentDialogProps) {
  const queryClient = useQueryClient()
  const [manualStep, setManualStep] = useState<Step | null>(null)
  const [payTargetId, setPayTargetId] = useState<number | null>(null)

  const invoicesQuery = useQuery({
    queryKey: ['invoices', 'byClient', client.id],
    queryFn: ({ signal }) => getInvoicesFn(client.id, signal),
    enabled: open,
  })

  const openInvoices = (invoicesQuery.data ?? []).filter((invoice) => invoice.status === 'open')
  const targetInvoiceId = payTargetId ?? initialInvoiceId ?? null
  const targetInvoice = targetInvoiceId
    ? invoicesQuery.data?.find((invoice) => invoice.id === targetInvoiceId)
    : undefined

  const step: Step =
    manualStep ??
    (targetInvoiceId != null
      ? 'pay'
      : !invoicesQuery.isPending && openInvoices.length === 0
        ? 'build'
        : 'choose')

  const mutation = useMutation({
    mutationFn: async (input: SubmitInput): Promise<SubmitResult> => {
      let invoiceId: number | null = null
      let invoiceTotal: string | null = null
      const receipts: ReceiptDetail[] = []
      let closed = false

      try {
        if (input.kind === 'create') {
          const created = await createInvoiceFn(input.body)
          invoiceId = created.id
          invoiceTotal = created.total
        } else {
          invoiceId = input.invoiceId
        }

        for (const payment of input.payments) {
          if (closed) break
          const receipt = await recordPaymentFn({ invoiceId, ...payment })
          receipts.push(receipt)
          closed = receipt.invoiceClosed
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Something went wrong'
        const createdNote = invoiceId != null && input.kind === 'create' ? `Invoice #${invoiceId} was created` : null
        const paidNote = receipts.length > 0 ? `${receipts.length} payment(s) were recorded` : null
        const prefix = [createdNote, paidNote].filter(Boolean).join(' and ')
        throw new Error(prefix ? `${prefix}, but ${message[0].toLowerCase()}${message.slice(1)}` : message)
      }

      return {
        invoiceId,
        finalStatus: closed ? 'closed' : 'open',
        invoiceTotal,
        receipts,
        skippedPayments: input.payments.slice(receipts.length),
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices', 'byClient', client.id] })
    },
  })

  function reset() {
    setManualStep(null)
    setPayTargetId(null)
    mutation.reset()
  }

  // Any app-triggered close (Cancel, Done) must reset local step/mutation
  // state itself - it calls the onOpenChange *prop* directly rather than
  // going through Radix's dismiss flow, so <Dialog onOpenChange> below never
  // sees it and won't run reset() on its own.
  function closeAndReset() {
    onOpenChange(false)
    reset()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        {mutation.isSuccess ? (
          <ResultSummary result={mutation.data} onClose={closeAndReset} />
        ) : step === 'choose' ? (
          <InvoiceChoiceStep
            isLoading={invoicesQuery.isPending}
            isError={invoicesQuery.isError}
            openInvoices={openInvoices}
            onPay={(invoiceId) => {
              setPayTargetId(invoiceId)
              setManualStep('pay')
            }}
            onCreateNew={() => setManualStep('build')}
            onCancel={closeAndReset}
          />
        ) : step === 'build' ? (
          <NewInvoiceForm
            policy={policy}
            onSubmit={(body, payments) => mutation.mutate({ kind: 'create', body, payments })}
            onCancel={closeAndReset}
            onBack={
              initialInvoiceId == null && openInvoices.length > 0
                ? () => setManualStep('choose')
                : undefined
            }
            isPending={mutation.isPending}
            errorMessage={mutation.isError ? mutation.error.message : null}
          />
        ) : targetInvoice ? (
          <PayInvoiceForm
            invoice={targetInvoice}
            onSubmit={(payments) =>
              mutation.mutate({ kind: 'pay', invoiceId: targetInvoice.id, payments })
            }
            onCancel={closeAndReset}
            onBack={
              initialInvoiceId == null
                ? () => {
                    setPayTargetId(null)
                    setManualStep('choose')
                  }
                : undefined
            }
            isPending={mutation.isPending}
            errorMessage={mutation.isError ? mutation.error.message : null}
          />
        ) : (
          <div className="flex flex-col gap-2 py-8">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
