import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { getPolicyLogs } from '@/api/policyLogs'

interface PolicyLogsProps {
  policyId: number
  onAddLog: () => void
  getPolicyLogsFn?: typeof getPolicyLogs
}

export function PolicyLogs({
  policyId,
  onAddLog,
  getPolicyLogsFn = getPolicyLogs,
}: PolicyLogsProps) {
  const { data: logs, isPending, isError } = useQuery({
    queryKey: ['policyLogs', policyId],
    queryFn: ({ signal }) => getPolicyLogsFn(policyId, signal),
  })

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">Logs</p>
        <Button type="button" variant="outline" size="sm" onClick={onAddLog}>
          Add log
        </Button>
      </div>

      {isError && <p className="text-sm text-destructive">Failed to load logs.</p>}
      {isPending && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      )}
      {!isPending && !isError && logs && logs.length === 0 && (
        <p className="text-sm text-muted-foreground">No logs yet. Press ⌘L / Ctrl+L to add one.</p>
      )}
      {!isPending &&
        !isError &&
        logs?.map((log) => (
          <div key={log.id} className="mb-2 rounded-md border p-2 text-sm last:mb-0">
            <p className="text-xs text-muted-foreground">
              #{log.logNumber} · {log.author.name ?? log.author.email} ·{' '}
              {new Date(log.createdAt).toLocaleString()}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{log.body}</p>
          </div>
        ))}
    </div>
  )
}
