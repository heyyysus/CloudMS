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
  // When set, only invoices for this policy are shown. The query still
  // fetches all of the client's invoices (one shared cache entry across
  // every policy's Accounting subtab); filtering happens client-side.
  policyId?: number
  onPay: (invoiceId: number) => void
  onSelect: (invoiceId: number) => void
  getInvoicesFn?: typeof getInvoices
}

export function ClientInvoices({
  clientId,
  policyId,
  onPay,
  onSelect,
  getInvoicesFn = getInvoices,
}: ClientInvoicesProps) {
  const {
    data: allInvoices,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['invoices', 'byClient', clientId],
    queryFn: ({ signal }) => getInvoicesFn(clientId, signal),
  })

  const invoices =
    policyId === undefined ? allInvoices : allInvoices?.filter((invoice) => invoice.policyId === policyId)

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
          <p className="text-sm text-muted-foreground">
            {policyId === undefined ? 'No invoices.' : 'No invoices for this policy.'}
          </p>
        )}
        {!isPending &&
          !isError &&
          invoices?.map((invoice) => {
            const dueCents = amountDueCents(invoice)
            return (
              <div
                key={invoice.id}
                className="flex items-center justify-between gap-1 rounded-lg border pr-2 text-sm"
              >
                {/* The selectable area (opens the printable receipt) and the Pay
                    button are siblings, never nested, so each is its own control. */}
                <button
                  type="button"
                  onClick={() => onSelect(invoice.id)}
                  className="flex flex-1 cursor-pointer items-center justify-between gap-3 rounded-lg p-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span>
                    <span className="block font-medium">Invoice #{invoice.id}</span>
                    <span
                      className={cn('block text-xs capitalize', INVOICE_STATUS_TEXT_CLASS[invoice.status])}
                    >
                      {INVOICE_STATUS_LABEL[invoice.status]}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block">{formatMoney(invoice.total)}</span>
                    {invoice.status === 'open' && (
                      <span className="block text-xs text-muted-foreground">
                        {formatMoney(dueCents / 100)} due
                      </span>
                    )}
                  </span>
                </button>
                {invoice.status === 'open' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onPay(invoice.id)}
                  >
                    Pay
                  </Button>
                )}
              </div>
            )
          })}
      </CardContent>
    </Card>
  )
}
