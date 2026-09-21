import { Building2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Membership } from '@/api/auth'

interface OrgPickerProps {
  memberships: Membership[]
  onSelect: (orgId: string) => void
  pending?: boolean
}

// Presentational: no context, no navigation, no API calls - the /select-org
// page and its tests own those. Renders standalone so it can be exercised in
// a story per the props-over-context rule in docs/frontend-ui-design.md.
export function OrgPicker({ memberships, onSelect, pending = false }: OrgPickerProps) {
  return (
    <div className="grid gap-2">
      {memberships.map((membership) => (
        <Button
          key={membership.orgId}
          type="button"
          variant="outline"
          className="h-auto justify-start gap-3 py-3"
          disabled={pending}
          onClick={() => onSelect(membership.orgId)}
        >
          <Building2 className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-left">
            <span className="block text-sm font-medium">{membership.name}</span>
            <span className="block text-xs font-normal text-muted-foreground capitalize">
              {membership.role}
            </span>
          </span>
          {pending && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </Button>
      ))}
    </div>
  )
}
