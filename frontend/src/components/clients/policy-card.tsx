import { useState, type ReactNode } from 'react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { CopyText } from '@/components/ui/copy-text'
import { DriverDetailDialog } from '@/components/clients/driver-detail-dialog'
import { VehicleDetailDialog } from '@/components/clients/vehicle-detail-dialog'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/date-display'
import { formatNameLastFirst } from '@/lib/person-name'
import type { AutoPolicy } from '@/api/clients'
import type { PolicyDetail, PolicyDriver, Vehicle } from '@/api/policies'
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

// Plain-text rows (no border/padding/background) that open a detail dialog
// on click - distinct from CopyText, which copies rather than navigates.
const ROW_CLASS =
  'w-full cursor-pointer text-left hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm'

interface PolicyCardProps {
  policy: AutoPolicy
  detail?: PolicyDetail
  isLoading?: boolean
  isError?: boolean
  action?: ReactNode
}

export function PolicyCard({
  policy,
  detail,
  isLoading,
  isError,
  action,
}: PolicyCardProps) {
  const status = displayStatus(policy)
  const [selectedDriver, setSelectedDriver] = useState<PolicyDriver | null>(null)
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-col text-base">
          <CopyText value={policy.policyNumber} label="policy number" />
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
            {formatDate(policy.effectiveDate) ? (
              <CopyText value={formatDate(policy.effectiveDate)!} label="effective date" />
            ) : (
              <p>—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Expiration</p>
            {formatDate(policy.expirationDate) ? (
              <CopyText value={formatDate(policy.expirationDate)!} label="expiration date" />
            ) : (
              <p>—</p>
            )}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Carrier</p>
            {isLoading ? <Skeleton className="h-4 w-20" /> : <p>{detail?.carrier.name ?? '—'}</p>}
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Drivers</p>
          {isError && <p className="text-sm text-destructive">Failed to load drivers.</p>}
          {isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          )}
          {!isLoading && !isError && detail && detail.policyDrivers.length === 0 && (
            <p className="text-sm text-muted-foreground">No drivers.</p>
          )}
          {!isLoading && !isError && detail && detail.policyDrivers.length > 0 && (
            <div className="flex flex-col gap-1">
              {detail.policyDrivers.map((policyDriver) => (
                <button
                  key={policyDriver.id}
                  type="button"
                  onClick={() => setSelectedDriver(policyDriver)}
                  aria-label={`View ${formatNameLastFirst(policyDriver.driver.person)}`}
                  className={ROW_CLASS}
                >
                  {formatNameLastFirst(policyDriver.driver.person)}
                </button>
              ))}
            </div>
          )}
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Vehicles</p>
          {isError && <p className="text-sm text-destructive">Failed to load vehicles.</p>}
          {isLoading && (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-full" />
              <Skeleton className="h-7 w-full" />
            </div>
          )}
          {!isLoading && !isError && detail && detail.vehicles.length === 0 && (
            <p className="text-sm text-muted-foreground">No vehicles.</p>
          )}
          {!isLoading && !isError && detail && detail.vehicles.length > 0 && (
            <div className="flex flex-col gap-1">
              {detail.vehicles.map((vehicle) => (
                <button
                  key={vehicle.id}
                  type="button"
                  onClick={() => setSelectedVehicle(vehicle)}
                  aria-label={`View ${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                  className={ROW_CLASS}
                >
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardContent>

      <DriverDetailDialog
        driver={selectedDriver}
        onOpenChange={(open) => {
          if (!open) setSelectedDriver(null)
        }}
      />
      <VehicleDetailDialog
        vehicle={selectedVehicle}
        onOpenChange={(open) => {
          if (!open) setSelectedVehicle(null)
        }}
      />
    </Card>
  )
}
