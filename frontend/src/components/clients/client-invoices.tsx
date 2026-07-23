import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/money'
import { INVOICE_STATUS_LABEL, INVOICE_STATUS_TEXT_CLASS } from '@/lib/invoice-options'
import { amountDueCents, getInvoices } from '@/api/invoices'

interface ClientInvoicesProps {
  clientId: number
  onPay: (invoiceId: number) => void
  getInvoicesFn?: typeof getInvoices
}

export function ClientInvoices({ clientId, onPay, getInvoicesFn = getInvoices }: ClientInvoicesProps) {
  const {
    data: invoices,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['invoices', 'byClient', clientId],
    queryFn: ({ signal }) => getInvoicesFn(clientId, signal),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoices</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load invoices.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!isPending && !isError && invoices && invoices.length === 0 && (
          <p className="text-sm text-muted-foreground">No invoices.</p>
        )}
        {!isPending &&
          !isError &&
          invoices?.map((invoice) => {
            const dueCents = amountDueCents(invoice)
            return (
              <div
                key={invoice.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm"
              >
                <div>
                  <p className="font-medium">Invoice #{invoice.id}</p>
                  <p className={cn('text-xs capitalize', INVOICE_STATUS_TEXT_CLASS[invoice.status])}>
                    {INVOICE_STATUS_LABEL[invoice.status]}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p>{formatMoney(invoice.total)}</p>
                    {invoice.status === 'open' && (
                      <p className="text-xs text-muted-foreground">{formatMoney(dueCents / 100)} due</p>
                    )}
                  </div>
                  {invoice.status === 'open' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => onPay(invoice.id)}>
                      Pay
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
      </CardContent>
    </Card>
  )
}
