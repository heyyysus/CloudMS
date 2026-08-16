import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { stripFileExtension } from '@/lib/file-display'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import type { PolicyAttachment } from '@/api/policyAttachments'
import { linkAttachmentsToLog } from '@/api/policyLogAttachments'
import { getPolicyLogs, type PolicyLog } from '@/api/policyLogs'

// Narrower than the logs list: no Log #/Date headers, and the body gets the
// room instead, since picking the right log is the only job here.
const LOG_PICKER_GRID = 'grid grid-cols-[2.5rem_9rem_2.75rem_minmax(0,1fr)] items-center gap-x-3 px-2'

interface LogPickerProps {
  logs: PolicyLog[]
  selectedLogId: number | null
  onSelect: (logId: number) => void
  currentUserId?: number
}

export function LogPicker({ logs, selectedLogId, onSelect, currentUserId }: LogPickerProps) {
  if (logs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This policy has no logs yet. Add one before linking attachments to it.
      </p>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Log to link to"
      className="max-h-80 overflow-y-auto rounded-md border bg-background font-mono text-sm"
    >
      {logs.map((log) => {
        const isSelected = log.id === selectedLogId
        return (
          <button
            key={log.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(log.id)}
            className={cn(
              LOG_PICKER_GRID,
              'w-full cursor-pointer py-1 text-left odd:bg-muted-foreground/15 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none',
              isSelected && 'bg-primary/20 odd:bg-primary/20'
            )}
          >
            <span className="text-right tabular-nums text-primary/80">{log.logNumber}</span>
            <span className="whitespace-nowrap text-muted-foreground">
              {formatLogTimestamp(log.createdAt)}
            </span>
            <LogAuthorChip author={log.author} isCurrentUser={log.author.id === currentUserId} />
            <span className="min-w-0 truncate text-foreground">{log.body}</span>
          </button>
        )
      })}
    </div>
  )
}

interface LinkAttachmentsToLogDialogProps {
  policyId: number
  // The rows ticked in the attachments list. Empty while the dialog is closed.
  attachments: PolicyAttachment[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onLinked: () => void
  currentUserId?: number
  getPolicyLogsFn?: typeof getPolicyLogs
  linkAttachmentsToLogFn?: typeof linkAttachmentsToLog
}

// Many attachments to one log. Logs are scoped to the policy the attachments
// belong to - the server rejects a cross-policy link, so offering anything
// else would only produce errors. Any user's log is a valid target.
export function LinkAttachmentsToLogDialog({
  policyId,
  attachments,
  open,
  onOpenChange,
  onLinked,
  currentUserId,
  getPolicyLogsFn = getPolicyLogs,
  linkAttachmentsToLogFn = linkAttachmentsToLog,
}: LinkAttachmentsToLogDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null)

  // Shares the Logs subtab's cache entry, so this usually paints from memory.
  const { data: logs, isPending, isError } = useQuery({
    queryKey: ['policyLogs', policyId],
    queryFn: ({ signal }) => getPolicyLogsFn(policyId, signal),
    enabled: open,
  })

  // A stale pick from a previous open would silently link to the wrong log.
  useEffect(() => {
    if (!open) setSelectedLogId(null)
  }, [open])

  const mutation = useMutation({
    mutationFn: (logId: number) =>
      linkAttachmentsToLogFn({ logId, attachmentIds: attachments.map((a) => a.id) }),
    onSuccess: (_links, logId) => {
      queryClient.invalidateQueries({ queryKey: ['policyLogAttachments', policyId] })
      const logNumber = logs?.find((log) => log.id === logId)?.logNumber
      toast.success(
        `Linked ${attachments.length === 1 ? '1 attachment' : `${attachments.length} attachments`} to log #${logNumber}`
      )
      onOpenChange(false)
      onLinked()
    },
    onError: (error) => toast.error(error.message),
  })

  // The parent clears its selection as soon as a link lands, so `attachments`
  // empties while the dialog is still playing its close animation. Holding the
  // last non-empty list keeps the description from flashing "these 0
  // attachments" on the way out.
  const shown = useRef(attachments)
  if (attachments.length > 0) shown.current = attachments
  const forDisplay = shown.current

  const description =
    forDisplay.length === 1
      ? `Choose the log to file "${stripFileExtension(forDisplay[0].fileName)}" under.`
      : `Choose the log to file these ${forDisplay.length} attachments under.`

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Link to log</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {isError && <p className="text-sm text-destructive">Failed to load logs.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {!isPending && !isError && logs && (
          <LogPicker
            logs={logs}
            selectedLogId={selectedLogId}
            onSelect={setSelectedLogId}
            currentUserId={currentUserId}
          />
        )}

        {mutation.isError && (
          <div role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={selectedLogId === null || attachments.length === 0 || mutation.isPending}
            onClick={() => selectedLogId !== null && mutation.mutate(selectedLogId)}
          >
            {mutation.isPending ? 'Linking…' : 'Link'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
