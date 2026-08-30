import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PaperclipIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttachmentPreviewDialog } from '@/components/clients/attachment-preview-dialog'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { LogDetailDialog } from '@/components/clients/log-detail-dialog'
import { RECORD_LIST_CONTAINER, RECORD_LIST_HEADER, RECORD_LIST_ROW } from '@/components/clients/record-list'
import { useToast } from '@/components/ui/toast'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { cn } from '@/lib/utils'
import { getPolicyAttachmentLink, type PolicyAttachment } from '@/api/policyAttachments'
import {
  getPolicyLogAttachments,
  unlinkPolicyLogAttachment,
} from '@/api/policyLogAttachments'
import { getPolicyLogs, type PolicyLog } from '@/api/policyLogs'

interface PolicyLogsProps {
  policyId: number
  onAddLog: () => void
  currentUserId?: number
  getPolicyLogsFn?: typeof getPolicyLogs
  getPolicyLogAttachmentsFn?: typeof getPolicyLogAttachments
  unlinkPolicyLogAttachmentFn?: typeof unlinkPolicyLogAttachment
  getPolicyAttachmentLinkFn?: typeof getPolicyAttachmentLink
}

// Shared by the header and every row so the columns can never drift: Log #
// (right-aligned, fits 4 digits) | Date/Time (fits "MM/DD/YYYY - hh:mmpm") |
// author chip | content (the only column allowed to grow/shrink).
const LOG_GRID = 'grid grid-cols-[3rem_11rem_2.75rem_minmax(0,1fr)] items-center gap-x-3 px-2'

export function PolicyLogs({
  policyId,
  onAddLog,
  currentUserId,
  getPolicyLogsFn = getPolicyLogs,
  getPolicyLogAttachmentsFn = getPolicyLogAttachments,
  unlinkPolicyLogAttachmentFn = unlinkPolicyLogAttachment,
  getPolicyAttachmentLinkFn = getPolicyAttachmentLink,
}: PolicyLogsProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [selectedLog, setSelectedLog] = useState<PolicyLog | null>(null)
  const [previewAttachment, setPreviewAttachment] = useState<PolicyAttachment | null>(null)

  const { data: logs, isPending, isError } = useQuery({
    queryKey: ['policyLogs', policyId],
    queryFn: ({ signal }) => getPolicyLogsFn(policyId, signal),
  })

  // One call for the whole policy: it badges every row here and fills the
  // detail dialog, so opening a log costs no extra request.
  const { data: links } = useQuery({
    queryKey: ['policyLogAttachments', policyId],
    queryFn: ({ signal }) => getPolicyLogAttachmentsFn(policyId, signal),
  })

  const unlink = useMutation({
    mutationFn: (linkId: number) => unlinkPolicyLogAttachmentFn(linkId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['policyLogAttachments', policyId] }),
    onError: (error) => toast.error(error.message),
  })

  const linkedLogIds = new Set(links?.map((link) => link.logId))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logs</CardTitle>
        <CardAction>
          <Button type="button" variant="outline" size="sm" onClick={onAddLog}>
            Add log
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load logs.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {!isPending && !isError && logs && logs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No logs yet. Press ⌘L / Ctrl+L to add one.
          </p>
        )}
        {!isPending && !isError && logs && logs.length > 0 && (
          <div className={cn(RECORD_LIST_CONTAINER, 'font-mono')}>
            <div className={cn(LOG_GRID, RECORD_LIST_HEADER)}>
              <span className="text-right">Log #</span>
              <span>Date/Time</span>
              <span>User</span>
              <span>Content</span>
            </div>
            {logs.map((log) => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelectedLog(log)}
                aria-label={`Open log ${log.logNumber}`}
                className={cn(LOG_GRID, RECORD_LIST_ROW, 'cursor-grab')}
              >
                <span className="text-right tabular-nums text-primary/80">{log.logNumber}</span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {formatLogTimestamp(log.createdAt)}
                </span>
                <LogAuthorChip author={log.author} isCurrentUser={log.author.id === currentUserId} />
                <span className="min-w-0 truncate text-foreground">
                  {/* Without this, linked documents are invisible until you
                      happen to open the log they sit under. */}
                  {linkedLogIds.has(log.id) && (
                    <PaperclipIcon
                      aria-label="Has attachments"
                      className="mr-1 inline size-3 align-[-0.1em] text-muted-foreground"
                    />
                  )}
                  <span className="text-muted-foreground">-- </span>
                  {log.body}
                </span>
              </button>
            ))}
          </div>
        )}
      </CardContent>
      <LogDetailDialog
        log={selectedLog}
        currentUserId={currentUserId}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null)
        }}
        links={links?.filter((link) => link.logId === selectedLog?.id) ?? []}
        onPreviewAttachment={setPreviewAttachment}
        onUnlink={(linkId) => unlink.mutate(linkId)}
        unlinkingId={unlink.isPending ? unlink.variables : undefined}
      />
      {/* A sibling, not nested inside the log dialog: two stacked Radix modals
          each keep their own focus trap, so closing the preview drops the user
          back on the log they opened it from. */}
      <AttachmentPreviewDialog
        attachment={previewAttachment}
        onOpenChange={(open) => {
          if (!open) setPreviewAttachment(null)
        }}
        getPolicyAttachmentLinkFn={getPolicyAttachmentLinkFn}
      />
    </Card>
  )
}
