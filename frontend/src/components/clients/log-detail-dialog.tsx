import { CheckIcon, CopyIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { useCopyToClipboard } from '@/components/ui/copy-text'
import { formatLogTimestamp } from '@/lib/log-datetime'
import type { PolicyLog } from '@/api/policyLogs'

function CopyLogBodyButton({ body }: { body: string }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      aria-label="Copy log body"
      onClick={() => copy(body)}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copied!' : 'Copy'}
    </Button>
  )
}

interface LogDetailDialogProps {
  log: PolicyLog | null
  currentUserId?: number
  onOpenChange: (open: boolean) => void
}

// Presentational: takes the selected log as a prop rather than owning its
// own fetch, so it renders standalone in Storybook. Stays mounted (with
// open={log !== null}) so the close animation can play as `log` clears.
export function LogDetailDialog({ log, currentUserId, onOpenChange }: LogDetailDialogProps) {
  return (
    <Dialog open={log !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {log && (
          <>
            <DialogHeader>
              <DialogTitle>Log #{log.logNumber}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <LogAuthorChip author={log.author} isCurrentUser={log.author.id === currentUserId} />
                <span>{log.author.name ?? log.author.email}</span>
                <span>·</span>
                <span>{formatLogTimestamp(log.createdAt)}</span>
              </DialogDescription>
            </DialogHeader>
            <p className="max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-sm whitespace-pre-wrap">
              {log.body}
            </p>
            <div className="flex justify-end">
              <CopyLogBodyButton key={log.id} body={log.body} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
