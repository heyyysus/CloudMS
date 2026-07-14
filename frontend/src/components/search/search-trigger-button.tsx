import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SearchTriggerButtonProps {
  onClick: () => void
}

export function SearchTriggerButton({ onClick }: SearchTriggerButtonProps) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="text-muted-foreground">
      <Search />
      <span className="hidden sm:inline">Search…</span>
      <kbd className="hidden items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-flex">
        {navigator.platform.toLowerCase().includes('mac') ? '⌘K' : 'Ctrl K'}
      </kbd>
    </Button>
  )
}
