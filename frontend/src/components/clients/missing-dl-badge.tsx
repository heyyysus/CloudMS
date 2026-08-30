import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

// Informational, not an error - a missing DL is a normal state for a
// prospect. Text (not just the icon/color) carries the meaning.
export function MissingDlBadge({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-warning', className)}>
      <TriangleAlert className="size-3" aria-hidden="true" />
      No DL on file
    </span>
  )
}
