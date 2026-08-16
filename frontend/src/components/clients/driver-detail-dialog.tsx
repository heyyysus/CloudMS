import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CopyText } from '@/components/ui/copy-text'
import { formatDate } from '@/lib/date-display'
import { formatNameLastFirst } from '@/lib/person-name'
import { MARITAL_OPTIONS, RELATION_OPTIONS } from '@/components/clients/add-policy-dialog'
import type { PolicyDriver } from '@/api/policies'

const GENDER_LABEL: Record<'m' | 'f' | 'other', string> = { m: 'Male', f: 'Female', other: 'Other' }

function relationLabel(value: string): string {
  return RELATION_OPTIONS.find((option) => option.value === value)?.label ?? value
}

function maritalLabel(value: string | null): string {
  if (!value) return '—'
  return MARITAL_OPTIONS.includes(value as (typeof MARITAL_OPTIONS)[number])
    ? value[0].toUpperCase() + value.slice(1)
    : value
}

function Row({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <CopyText className="text-sm" value={value} copyValue={copyValue ?? value} label={label} />
    </div>
  )
}

interface DriverDetailDialogProps {
  driver: PolicyDriver | null
  onOpenChange: (open: boolean) => void
}

// Presentational: takes the selected driver as a prop rather than owning its
// own fetch, so it renders standalone in Storybook. Stays mounted (with
// open={driver !== null}) so the close animation can play as `driver` clears
// - same pattern as LogDetailDialog / AttachmentPreviewDialog.
export function DriverDetailDialog({ driver, onOpenChange }: DriverDetailDialogProps) {
  return (
    <Dialog open={driver !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {driver && (
          <>
            <DialogHeader>
              <DialogTitle>{formatNameLastFirst(driver.driver.person)}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Row label="Date of Birth" value={formatDate(driver.driver.person.dateOfBirth) ?? '—'} />
              <Row label="DL Number" value={driver.driver.dlNumber ?? '—'} />
              <Row label="Relation to Insured" value={relationLabel(driver.driver.person.relationToInsured)} />
              <Row label="Marital Status" value={maritalLabel(driver.driver.person.maritalStatus)} />
              <Row label="Gender" value={GENDER_LABEL[driver.driver.person.gender]} />
              <Row label="Rating" value={driver.driver.rating === 'excluded' ? 'Excluded' : 'Rated'} />
              <Row label="SR-22" value={driver.driver.sr22 ? 'Yes' : 'No'} />
            </div>
            <DialogFooter showCloseButton />
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
