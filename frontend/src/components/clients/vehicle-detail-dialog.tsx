import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { CopyText } from '@/components/ui/copy-text'
import { COVERAGE_LABELS } from '@/components/clients/policy-card'
import type { Vehicle } from '@/api/policies'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <CopyText className="text-sm" value={value} label={label} />
    </div>
  )
}

interface VehicleDetailDialogProps {
  vehicle: Vehicle | null
  onOpenChange: (open: boolean) => void
}

// Presentational, same pattern as DriverDetailDialog / LogDetailDialog: takes
// the selected vehicle as a prop, stays mounted so the close animation plays.
export function VehicleDetailDialog({ vehicle, onOpenChange }: VehicleDetailDialogProps) {
  const coverages = vehicle
    ? (Object.entries(COVERAGE_LABELS) as [keyof typeof COVERAGE_LABELS, string][])
        .map(([key, label]) => {
          const value = vehicle[key]
          return value ? { label, value } : null
        })
        .filter((row): row is { label: string; value: string } => row !== null)
    : []

  return (
    <Dialog open={vehicle !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {vehicle && (
          <>
            <DialogHeader>
              <DialogTitle>
                <CopyText
                  value={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                  label="vehicle"
                />
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Year" value={String(vehicle.year)} />
              <Row label="Make" value={vehicle.make} />
              <Row label="Model" value={vehicle.model} />
              <Row label="VIN" value={vehicle.vin} />
              <Row label="Garaging Zip" value={vehicle.garagingZip} />
            </div>

            {coverages.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">Coverages</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {coverages.map((row) => (
                      <Row key={row.label} label={row.label} value={row.value} />
                    ))}
                  </div>
                </div>
              </>
            )}

            <DialogFooter showCloseButton />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
