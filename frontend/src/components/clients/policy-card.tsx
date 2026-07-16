import type { ReactNode } from 'react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { AutoPolicy } from '@/api/clients'
import type { PolicyDetail, Vehicle } from '@/api/policies'
import { displayStatus, STATUS_TEXT_CLASS } from '@/lib/policy-status'

export const COVERAGE_LABELS: Record<
  Extract<
    keyof Vehicle,
    | 'coverageBi'
    | 'coveragePd'
    | 'coverageUmbi'
    | 'coverageUmpd'
    | 'coverageCdw'
    | 'coverageMedpay'
    | 'coverageColl'
    | 'coverageComp'
    | 'coverageRentalReimbursement'
    | 'coverageTowing'
  >,
  string
> = {
  coverageBi: 'BI',
  coveragePd: 'PD',
  coverageUmbi: 'UM/BI',
  coverageUmpd: 'UM/PD',
  coverageCdw: 'CDW',
  coverageMedpay: 'Med Pay',
  coverageColl: 'Collision',
  coverageComp: 'Comprehensive',
  coverageRentalReimbursement: 'Rental',
  coverageTowing: 'Towing',
}

interface PolicyCardProps {
  policy: AutoPolicy
  detail?: PolicyDetail
  isLoading?: boolean
  isError?: boolean
  action?: ReactNode
}

export function PolicyCard({ policy, detail, isLoading, isError, action }: PolicyCardProps) {
  const status = displayStatus(policy)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-col text-base">
          <span>{policy.policyNumber}</span>
          <span className={cn('text-xs font-normal capitalize', STATUS_TEXT_CLASS[status])}>
            {status}
          </span>
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Effective</p>
            <p>{policy.effectiveDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Expiration</p>
            <p>{policy.expirationDate}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Carrier</p>
            {isLoading ? <Skeleton className="h-4 w-20" /> : <p>{detail?.carrier.name ?? '—'}</p>}
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Vehicles</p>
          {isError && <p className="text-sm text-destructive">Failed to load vehicles.</p>}
          {isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          )}
          {!isLoading && !isError && detail && detail.vehicles.length === 0 && (
            <p className="text-sm text-muted-foreground">No vehicles.</p>
          )}
          {!isLoading &&
            !isError &&
            detail &&
            detail.vehicles.map((vehicle) => {
              const coverages = (
                Object.entries(COVERAGE_LABELS) as [keyof typeof COVERAGE_LABELS, string][]
              )
                .map(([key, label]) => {
                  const value = vehicle[key]
                  return value ? `${label} ${value}` : null
                })
                .filter(Boolean)

              return (
                <div key={vehicle.id} className="mb-2 rounded-md border p-2 text-sm last:mb-0">
                  <p>
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    VIN {vehicle.vin} · Garaging Zip {vehicle.garagingZip}
                  </p>
                  {coverages.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">{coverages.join(' · ')}</p>
                  )}
                </div>
              )
            })}
        </div>
      </CardContent>
    </Card>
  )
}
