import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

function TrustAccounting() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trust Accounting</h1>
        <p className="text-muted-foreground">Money held in trust on behalf of clients.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Trust ledger entries are already being recorded for every invoice, payment, and void.
            This page will surface them; until then the data is readable through the API at{' '}
            <code className="rounded bg-muted px-1 py-0.5">/trust-ledger</code> and{' '}
            <code className="rounded bg-muted px-1 py-0.5">/trust-balance</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default TrustAccounting
