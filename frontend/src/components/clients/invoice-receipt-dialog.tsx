import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BanIcon, PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubmitButton } from '@/components/ui/submit-button'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { formatMoney, toCents } from '@/lib/money'
import {
  INVOICE_ITEM_TYPE_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TEXT_CLASS,
  PAYMENT_METHOD_LABEL,
} from '@/lib/invoice-options'
import { amountDueCents, getInvoice, voidInvoice, type InvoiceDetail } from '@/api/invoices'
import { voidPayment } from '@/api/payments'
import type { AutoPolicy, ClientDetail } from '@/api/clients'
import { formatDate } from '@/lib/date-display'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { formatNameLastFirst } from '@/lib/person-name'

const voidFormSchema = z.object({
  reason: z.string().trim().max(2000, 'Max 2000 characters'),
})

type VoidFormValues = z.infer<typeof voidFormSchema>

interface VoidConfirmProps {
  title: string
  description: string
  submitLabel: string
  // Extra heads-up rendered above the reason box (e.g. the payments a cascade
  // will take with it). Never blocks the submit: the server is the authority
  // on whether a void is allowed, and its 409 is what the user reads.
  notice?: ReactNode
  onConfirm: (reason: string | null) => void
  onCancel: () => void
  isPending?: boolean
  errorMessage?: string | null
}

// The confirm step, shown inline inside the receipt dialog rather than as a
// nested modal, and shared by both the invoice and per-payment voids. Mounted
// only while confirming, so unmounting it is what discards a half-typed
// reason - there's no field to reset by hand.
function VoidConfirm({
  title,
  description,
  submitLabel,
  notice,
  onConfirm,
  onCancel,
  isPending,
  errorMessage,
}: VoidConfirmProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VoidFormValues>({
    resolver: zodResolver(voidFormSchema),
    defaultValues: { reason: '' },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => onConfirm(values.reason.trim() || null))}
      noValidate
      // print:hidden because the print stylesheet doesn't scope output to
      // #receipt-print-area - everything left visible in the dialog prints.
      className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 print:hidden"
    >
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {notice}

      <Field data-invalid={!!errors.reason}>
        <FieldLabel htmlFor="void-invoice-reason">Reason (optional)</FieldLabel>
        <Textarea
          id="void-invoice-reason"
          rows={3}
          maxLength={2000}
          autoFocus
          placeholder="Why is this being voided?"
          {...register('reason')}
        />
        <FieldError errors={errors.reason ? [errors.reason] : undefined} />
      </Field>

      {errorMessage && (
        <div role="alert" className="text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <SubmitButton variant="destructive" isPending={isPending} pendingLabel="Voiding…">
          {submitLabel}
        </SubmitButton>
      </div>
    </form>
  )
}

// Copy for the confirm step, which differs per target: voiding a payment is a
// single reversal, while voiding an invoice that still has payments takes them
// with it and says so up front.
function voidConfirmCopy(
  invoice: InvoiceDetail,
  target: VoidTarget,
  activePayments: InvoiceDetail['payments']
): Pick<VoidConfirmProps, 'title' | 'description' | 'submitLabel' | 'notice'> {
  if (target.kind === 'payment') {
    const payment = activePayments.find((p) => p.id === target.paymentId)
    return {
      title: `Void payment #${target.paymentId}?`,
      description:
        "This can't be undone. The payment's money is reversed out of the trust ledger, its receipt is voided, and the invoice reopens for the amount it had covered.",
      submitLabel: 'Void payment',
      notice: payment ? (
        <p className="text-sm text-muted-foreground">
          {PAYMENT_METHOD_LABEL[payment.method]} — {formatMoney(payment.amountApplied)} applied.
        </p>
      ) : null,
    }
  }

  const cascading = activePayments.length > 0
  return {
    title: `Void invoice #${invoice.id}?`,
    description:
      "This can't be undone. The invoice stays on file marked void, its money is reversed out of the trust ledger, and its PDF is withdrawn.",
    submitLabel: cascading
      ? `Void ${activePayments.length} payment(s) + invoice`
      : 'Void invoice',
    notice: cascading ? (
      <div className="flex flex-col gap-1 text-sm text-warning">
        <p>An invoice can&apos;t be voided while it has active payments, so these go first:</p>
        <ul className="list-disc pl-5">
          {activePayments.map((payment) => (
            <li key={payment.id}>
              Payment #{payment.id} — {PAYMENT_METHOD_LABEL[payment.method]}{' '}
              {formatMoney(payment.amountApplied)}
            </li>
          ))}
        </ul>
      </div>
    ) : null,
  }
}

interface InvoiceReceiptDialogProps {
  invoiceId: number | undefined
  client: ClientDetail
  policies: AutoPolicy[]
  open: boolean
  onOpenChange: (open: boolean) => void
  // Gates the void action. Taken as a prop rather than read from AuthContext
  // so the dialog still renders standalone in Storybook. Note the backend's
  // void route is requireAuth-only, so this is an affordance, not enforcement.
  isAdmin?: boolean
  getInvoiceFn?: typeof getInvoice
  voidInvoiceFn?: typeof voidInvoice
  voidPaymentFn?: typeof voidPayment
  printFn?: () => void
}

// Which void the confirm step is currently asking about. Voiding the invoice
// cascades through its active payments first, because the server refuses to
// void an invoice while any of them are still in effect.
type VoidTarget = { kind: 'invoice' } | { kind: 'payment'; paymentId: number }

type VoidResult =
  | { kind: 'payment' }
  | { kind: 'invoice'; invoice: InvoiceDetail; voidedPayments: number }

// A printable receipt / invoice summary. Opened by clicking any invoice (open,
// closed, or void) on the client page. The invoice detail (line items,
// payments, receipts) is fetched on demand; "Print / Download" hands off to the
// browser's print dialog so the user can save it as a PDF. Admins additionally
// get a void action here.
//
// The print stylesheet in index.css strips the surrounding chrome (#root, the
// overlay, the close button, the toast viewport) but does NOT scope printing to
// #receipt-print-area - anything left visible inside DialogContent lands on the
// printout. So dialog-only UI carries print:hidden, and anything that belongs
// on the printed record goes inside #receipt-print-area.
export function InvoiceReceiptDialog({
  invoiceId,
  client,
  policies,
  open,
  onOpenChange,
  isAdmin = false,
  getInvoiceFn = getInvoice,
  voidInvoiceFn = voidInvoice,
  voidPaymentFn = voidPayment,
  printFn = () => window.print(),
}: InvoiceReceiptDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null)

  const {
    data: invoice,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['invoices', 'detail', invoiceId],
    queryFn: ({ signal }) => getInvoiceFn(invoiceId!, signal),
    enabled: open && invoiceId != null,
  })

  const policyNumber = invoice
    ? policies.find((policy) => policy.id === invoice.policyId)?.policyNumber
    : undefined
  // Only payments still in effect (voids reverse their money and reduce
  // amountPaid, so a voided payment shouldn't appear on the receipt).
  const activePayments = invoice?.payments.filter((payment) => payment.voidedAt === null) ?? []

  // Everything the invoice detail feeds: the dialog itself, the invoice list
  // (its row gates "Pay" and the amount-due line on status === 'open'), the
  // policy log the void appends, and the PDF attachment it withdraws. The last
  // two use whole-key invalidation for the same reason invoice-payment-dialog
  // does - only the mounted query actually refetches.
  function refreshAfterVoid() {
    queryClient.invalidateQueries({ queryKey: ['invoices', 'byClient', client.id] })
    // Whole-key invalidation, same reasoning as policyLogs/policyAttachments
    // below: the ledger's payments query is keyed by policy, and voiding a
    // payment reopens its invoice, so any policy's ledger could be stale.
    queryClient.invalidateQueries({ queryKey: ['payments', 'byPolicy'] })
    queryClient.invalidateQueries({ queryKey: ['policyLogs'] })
    queryClient.invalidateQueries({ queryKey: ['policyAttachments'] })
  }

  const voidMutation = useMutation({
    // Only reachable once `invoice` has loaded, so invoiceId is set.
    mutationFn: async ({
      target,
      reason,
    }: {
      target: VoidTarget
      reason: string | null
    }): Promise<VoidResult> => {
      if (target.kind === 'payment') {
        await voidPaymentFn(target.paymentId, { reason })
        return { kind: 'payment' }
      }

      // Voiding the invoice cascades: the server refuses while any payment is
      // still in effect, so clear those first, then void the invoice. The same
      // reason is stamped on each write.
      let voidedPayments = 0
      try {
        for (const payment of activePayments) {
          await voidPaymentFn(payment.id, { reason })
          voidedPayments++
        }
        const updated = await voidInvoiceFn(invoiceId!, { reason })
        return { kind: 'invoice', invoice: updated, voidedPayments }
      } catch (err) {
        // Partial progress has to be named, or the user is left guessing what
        // actually landed. Same shaping as invoice-payment-dialog's multi-step
        // mutation.
        const message = err instanceof Error ? err.message : 'Something went wrong'
        if (voidedPayments === 0) throw new Error(message)
        throw new Error(
          `${voidedPayments} payment(s) were voided, but ${message[0].toLowerCase()}${message.slice(1)}`
        )
      }
    },
    onSuccess: (result) => {
      if (result.kind === 'invoice') {
        // The void response is the full detail, so the open dialog flips to
        // Void with no refetch flash.
        queryClient.setQueryData(['invoices', 'detail', invoiceId], result.invoice)
      } else {
        // Voiding a payment answers with the payment, not the invoice - and it
        // reopens the invoice and moves amountPaid, so this one has to refetch.
        queryClient.invalidateQueries({ queryKey: ['invoices', 'detail', invoiceId] })
      }
      refreshAfterVoid()
      setVoidTarget(null)
      toast.success(
        result.kind === 'payment'
          ? 'Payment voided'
          : result.voidedPayments > 0
            ? `Invoice and ${result.voidedPayments} payment(s) voided`
            : 'Invoice voided'
      )
    },
    onError: (error) => {
      // A cascade can fail partway, leaving payments voided that the cached
      // invoice still shows as active. Refetch so the confirm step the user is
      // looking at reflects what actually happened.
      queryClient.invalidateQueries({ queryKey: ['invoices', 'detail', invoiceId] })
      refreshAfterVoid()
      toast.error(error.message)
    },
  })

  const canVoid = isAdmin && invoice != null && invoice.status !== 'void'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setVoidTarget(null)
          voidMutation.reset()
        }
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="print:hidden">
          <DialogTitle>Receipt</DialogTitle>
          <DialogDescription>
            A printable summary for this invoice. Use Print / Download to save it as a PDF.
          </DialogDescription>
        </DialogHeader>

        {isError && <p className="text-sm text-destructive">Failed to load the invoice.</p>}

        {isPending && open && invoiceId != null && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {invoice && (
          <div id="receipt-print-area" className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1 border-b pb-3">
              <h2 className="font-heading text-lg font-semibold">Receipt / Invoice Summary</h2>
              <p className="text-xs text-muted-foreground">
                Printed {formatDate(new Date().toISOString().slice(0, 10))}
              </p>
            </div>

            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{formatNameLastFirst(client.namedInsured)}</p>
              <p className="text-muted-foreground">Client #{client.id}</p>
              {policyNumber && <p className="text-muted-foreground">Policy #{policyNumber}</p>}
            </div>

            <div className="flex items-center justify-between">
              <p className="font-medium">Invoice #{invoice.id}</p>
              <p className={cn('capitalize', INVOICE_STATUS_TEXT_CLASS[invoice.status])}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </p>
            </div>

            {/* Inside #receipt-print-area on purpose: a printed copy of a voided
                invoice has to say so. */}
            {invoice.status === 'void' && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2">
                <p className="font-medium text-destructive">
                  Voided{invoice.voidedAt ? ` ${formatLogTimestamp(invoice.voidedAt)}` : ''}
                </p>
                {invoice.voidReason && (
                  <p className="whitespace-pre-wrap text-muted-foreground">{invoice.voidReason}</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1">
              {invoice.items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3">
                  <span>
                    {INVOICE_ITEM_TYPE_LABEL[item.type]}
                    {item.carrier ? ` — ${item.carrier.name}` : ''}
                    {item.description && (
                      <span className="block text-xs text-muted-foreground">{item.description}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatMoney(item.amount)}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center justify-between border-t pt-1 font-medium">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(invoice.total)}</span>
              </div>
            </div>

            {activePayments.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="font-medium">Payments</p>
                {activePayments.map((payment) => {
                  const receipt = invoice.receipts.find((r) => r.paymentId === payment.id)
                  return (
                    <div key={payment.id} className="flex items-start justify-between gap-3">
                      <span>
                        {PAYMENT_METHOD_LABEL[payment.method]}
                        {receipt ? ` — Receipt #${receipt.id}` : ''}
                        {payment.note && (
                          <span className="block text-xs text-muted-foreground">{payment.note}</span>
                        )}
                        {toCents(payment.changeGiven) > 0 && (
                          <span className="block text-xs text-warning">
                            Change given: {formatMoney(payment.changeGiven)}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums">{formatMoney(payment.amountApplied)}</span>
                        {isAdmin && voidTarget === null && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-destructive hover:bg-destructive/10 print:hidden"
                            onClick={() =>
                              setVoidTarget({ kind: 'payment', paymentId: payment.id })
                            }
                          >
                            Void
                          </Button>
                        )}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-2 font-medium">
              <span>Amount due</span>
              <span className="tabular-nums">{formatMoney(amountDueCents(invoice) / 100)}</span>
            </div>

            {invoice.note && (
              <div className="flex flex-col gap-0.5 border-t pt-2">
                <p className="font-medium">Notes</p>
                <p className="whitespace-pre-wrap text-muted-foreground">{invoice.note}</p>
              </div>
            )}
          </div>
        )}

        {invoice && voidTarget && (
          <VoidConfirm
            {...voidConfirmCopy(invoice, voidTarget, activePayments)}
            onConfirm={(reason) => voidMutation.mutate({ target: voidTarget, reason })}
            onCancel={() => {
              setVoidTarget(null)
              voidMutation.reset()
            }}
            isPending={voidMutation.isPending}
            errorMessage={voidMutation.isError ? voidMutation.error.message : null}
          />
        )}

        <DialogFooter className="print:hidden sm:justify-between">
          {canVoid && voidTarget === null ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                // Reset here too, or a 409 from a previous attempt is still on
                // screen when the confirm step reopens.
                voidMutation.reset()
                setVoidTarget({ kind: 'invoice' })
              }}
            >
              <BanIcon /> Void invoice
            </Button>
          ) : (
            // Placeholder so Print stays right-aligned under justify-between.
            <span />
          )}
          <Button type="button" onClick={() => printFn()} disabled={!invoice}>
            <PrinterIcon /> Print / Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
