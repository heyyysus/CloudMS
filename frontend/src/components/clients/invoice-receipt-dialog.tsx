import { useQuery } from '@tanstack/react-query'
import { PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import {
  INVOICE_ITEM_TYPE_LABEL,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_TEXT_CLASS,
  PAYMENT_METHOD_LABEL,
} from '@/lib/invoice-options'
import { amountDueCents, getInvoice } from '@/api/invoices'
import { clientDisplayName, type AutoPolicy, type ClientDetail } from '@/api/clients'

interface InvoiceReceiptDialogProps {
  invoiceId: number | undefined
  client: ClientDetail
  policies: AutoPolicy[]
  open: boolean
  onOpenChange: (open: boolean) => void
  getInvoiceFn?: typeof getInvoice
  printFn?: () => void
}

// A printable receipt / invoice summary. Opened by clicking any invoice (open
// or closed) on the client page. The invoice detail (line items, payments,
// receipts) is fetched on demand; "Print / Download" hands off to the browser's
// print dialog, which the print stylesheet in index.css narrows to the receipt
// alone so the user can save it as a PDF.
export function InvoiceReceiptDialog({
  invoiceId,
  client,
  policies,
  open,
  onOpenChange,
  getInvoiceFn = getInvoice,
  printFn = () => window.print(),
}: InvoiceReceiptDialogProps) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                Printed {new Date().toLocaleDateString()}
              </p>
            </div>

            <div className="flex flex-col gap-0.5">
              <p className="font-medium">{clientDisplayName(client)}</p>
              <p className="text-muted-foreground">Client #{client.id}</p>
              {policyNumber && <p className="text-muted-foreground">Policy #{policyNumber}</p>}
            </div>

            <div className="flex items-center justify-between">
              <p className="font-medium">Invoice #{invoice.id}</p>
              <p className={cn('capitalize', INVOICE_STATUS_TEXT_CLASS[invoice.status])}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </p>
            </div>

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
                      </span>
                      <span className="tabular-nums">{formatMoney(payment.amountApplied)}</span>
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

        <DialogFooter className="print:hidden">
          <Button type="button" onClick={() => printFn()} disabled={!invoice}>
            <PrinterIcon /> Print / Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
