import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { LogDetailDialog } from '@/components/clients/log-detail-dialog'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { cn } from '@/lib/utils'
import { getPolicyLogs, type PolicyLog } from '@/api/policyLogs'

interface PolicyLogsProps {
  policyId: number
  onAddLog: () => void
  currentUserId?: number
  getPolicyLogsFn?: typeof getPolicyLogs
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
}: PolicyLogsProps) {
  const [selectedLog, setSelectedLog] = useState<PolicyLog | null>(null)

  const { data: logs, isPending, isError } = useQuery({
    queryKey: ['policyLogs', policyId],
    queryFn: ({ signal }) => getPolicyLogsFn(policyId, signal),
  })

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
          <div className="max-h-96 overflow-y-auto rounded-md border bg-background font-mono text-sm">
            <div
              className={cn(
                LOG_GRID,
                'sticky top-0 z-10 border-b bg-background py-1.5 text-xs font-semibold text-muted-foreground'
              )}
            >
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
                className={cn(
                  LOG_GRID,
                  'w-full cursor-grab py-1 text-left odd:bg-muted-foreground/15 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none'
                )}
              >
                <span className="text-right tabular-nums text-primary/80">{log.logNumber}</span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {formatLogTimestamp(log.createdAt)}
                </span>
                <LogAuthorChip author={log.author} isCurrentUser={log.author.id === currentUserId} />
                <span className="min-w-0 truncate text-foreground">
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
      />
    </Card>
  )
}
