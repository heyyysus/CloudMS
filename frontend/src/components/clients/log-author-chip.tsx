import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { initials } from '@/lib/initials'
import { cn } from '@/lib/utils'

interface LogAuthorChipProps {
  author: { name: string | null; email: string }
  isCurrentUser: boolean
  className?: string
}

// Solid initials chip used for a log's author, both in the log list row and
// the detail dialog. Purple for the current user, muted grey for everyone
// else; hovering reveals the full name (or email, if the user has no name).
export function LogAuthorChip({ author, isCurrentUser, className }: LogAuthorChipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-5 min-w-7 items-center justify-center rounded-md px-1 text-[10px] font-semibold',
            isCurrentUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            className
          )}
        >
          {initials(author)}
        </span>
      </TooltipTrigger>
      <TooltipContent>{author.name ?? author.email}</TooltipContent>
    </Tooltip>
  )
}
