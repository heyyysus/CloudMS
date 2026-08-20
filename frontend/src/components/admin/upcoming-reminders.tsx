import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router'
import { cancelScheduledEmail, getScheduledEmails } from '@/api/reminders'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { formatRelativeDays } from '@/lib/reminder-options'

interface UpcomingRemindersProps {
  getScheduledEmailsFn?: typeof getScheduledEmails
  cancelScheduledEmailFn?: typeof cancelScheduledEmail
}

// Everything queued agency-wide. The same rows a policy's Activities subtab
// shows, unfiltered — this is the view that makes auto-send comfortable,
// because anything about to go out can be seen and stopped from one place.
export function UpcomingReminders({
  getScheduledEmailsFn = getScheduledEmails,
  cancelScheduledEmailFn = cancelScheduledEmail,
}: UpcomingRemindersProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isPending, isError } = useQuery({
    queryKey: ['scheduledEmails', 'pending'],
    queryFn: ({ signal }) => getScheduledEmailsFn(['pending'], signal),
  })

  const cancel = useMutation({
    mutationFn: (id: number) => cancelScheduledEmailFn(id),
    onSuccess: () => {
      toast.success('Reminder cancelled')
      return queryClient.invalidateQueries({ queryKey: ['scheduledEmails'] })
    },
    onError: (error) => toast.error(error.message),
  })

  const scheduled = data?.scheduled ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming</CardTitle>
        <CardDescription>Reminders queued to send, soonest first.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load the queue.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {!isPending && !isError && scheduled.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing queued right now.</p>
        )}
        {!isPending &&
          !isError &&
          scheduled.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <Link
                  to={`/clients/${item.clientId}`}
                  className="block truncate font-medium hover:underline"
                >
                  {item.clientName}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.policyNumber}
                  {item.ruleName ? ` · ${item.ruleName}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className="text-xs text-muted-foreground"
                  title={formatLogTimestamp(item.scheduledFor)}
                >
                  {formatRelativeDays(item.scheduledFor)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => cancel.mutate(item.id)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}
