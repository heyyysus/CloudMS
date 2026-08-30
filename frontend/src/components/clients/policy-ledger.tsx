import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatMoney, centsToDecimalString } from '@/lib/money'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { buildPolicyLedger, summarizeLedger, LEDGER_ROW_KIND_LABEL } from '@/lib/policy-ledger'
import { getInvoices } from '@/api/invoices'
import { getPaymentsByPolicy } from '@/api/payments'

interface PolicyLedgerProps {
  clientId: number
  policyId: number
  onPay: (invoiceId: number) => void
  onSelect: (invoiceId: number) => void
  getInvoicesFn?: typeof getInvoices
  getPaymentsFn?: typeof getPaymentsByPolicy
}

// Balance is the client's charges minus credits on this policy (positive =
// owed, negative = credit) - not the agency's trust-account balance
// (GET /trust-balance), which nets to zero once an invoice is collected and
// swept and would always read as $0.00 here. A negative balance can't
// happen with today's data model (an overpayment becomes changeGiven,
// handed back rather than held); the arithmetic still handles it correctly
// for when that changes.
export function PolicyLedger({
  clientId,
  policyId,
  onPay,
  onSelect,
  getInvoicesFn = getInvoices,
  getPaymentsFn = getPaymentsByPolicy,
}: PolicyLedgerProps) {
  const {
    data: allInvoices,
    isPending: invoicesPending,
    isError: invoicesError,
  } = useQuery({
    queryKey: ['invoices', 'byClient', clientId],
    queryFn: ({ signal }) => getInvoicesFn(clientId, signal),
  })

  const {
    data: payments,
    isPending: paymentsPending,
    isError: paymentsError,
  } = useQuery({
    queryKey: ['payments', 'byPolicy', policyId],
    queryFn: ({ signal }) => getPaymentsFn(policyId, signal),
  })

  const isPending = invoicesPending || paymentsPending
  const isError = invoicesError || paymentsError

  const invoices = allInvoices?.filter((invoice) => invoice.policyId === policyId) ?? []
  const invoiceStatusById = new Map(invoices.map((invoice) => [invoice.id, invoice.status]))
  const rows = isPending || isError ? [] : buildPolicyLedger(invoices, payments ?? [])
  const summary = summarizeLedger(rows)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accounting</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isError && <p className="text-sm text-destructive">Failed to load accounting activity.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!isPending && !isError && (
          <>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Charged</p>
                <p className="font-medium tabular-nums">
                  {formatMoney(centsToDecimalString(summary.chargedCents))}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Paid</p>
                <p className="font-medium tabular-nums">
                  {formatMoney(centsToDecimalString(summary.creditedCents))}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">
                  {summary.balanceCents < 0 ? 'Credit balance' : 'Balance due'}
                </p>
                <p
                  className={cn(
                    'font-medium tabular-nums',
                    summary.balanceCents > 0 && 'text-destructive',
                    summary.balanceCents < 0 && 'text-success',
                    summary.balanceCents === 0 && 'text-muted-foreground'
                  )}
                >
                  {formatMoney(centsToDecimalString(Math.abs(summary.balanceCents)))}
                </p>
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounting activity for this policy.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Charge</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isInvoiceKind = row.kind === 'invoice' || row.kind === 'invoice_void'
                    const isVoidRow = row.kind === 'invoice_void' || row.kind === 'payment_void'
                    const canPay = row.kind === 'invoice' && invoiceStatusById.get(row.invoiceId) === 'open'
                    return (
                      <TableRow key={row.key} className={cn(row.isVoid && 'text-muted-foreground')}>
                        <TableCell className="tabular-nums">{formatLogTimestamp(row.at)}</TableCell>
                        <TableCell>{LEDGER_ROW_KIND_LABEL[row.kind]}</TableCell>
                        <TableCell>
                          {isInvoiceKind ? (
                            <button
                              type="button"
                              onClick={() => onSelect(row.invoiceId)}
                              className={cn(
                                'underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                row.isVoid && 'line-through'
                              )}
                            >
                              {row.reference}
                            </button>
                          ) : (
                            <span className={cn(row.isVoid && 'line-through')}>{row.reference}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={cn(row.isVoid && 'line-through')}>{row.description}</span>
                          {isVoidRow && row.voidReason && (
                            <span className="block text-xs text-muted-foreground">{row.voidReason}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.chargeCents !== 0 ? formatMoney(centsToDecimalString(row.chargeCents)) : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.creditCents !== 0 ? formatMoney(centsToDecimalString(row.creditCents)) : ''}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(centsToDecimalString(row.balanceCents))}
                        </TableCell>
                        <TableCell>
                          {canPay && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => onPay(row.invoiceId)}
                            >
                              Pay
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
