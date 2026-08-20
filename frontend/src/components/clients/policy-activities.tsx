import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { formatLogTimestamp } from '@/lib/log-datetime'
import {
  formatRelativeDays,
  SCHEDULED_EMAIL_STATUS_LABEL,
  SCHEDULED_EMAIL_STATUS_TEXT_CLASS,
} from '@/lib/reminder-options'
import { getPolicyActivities, type PolicyActivity } from '@/api/activities'
import { cancelScheduledEmail } from '@/api/reminders'

interface PolicyActivitiesProps {
  policyId: number
  getPolicyActivitiesFn?: typeof getPolicyActivities
  cancelScheduledEmailFn?: typeof cancelScheduledEmail
}

// The numeric id the cancel route wants, recovered from the namespaced id the
// API returns. Only reminders are cancellable today; a future "task:7" row
// would route its own way.
function scheduledEmailId(activity: PolicyActivity): number {
  return Number(activity.id.split(':')[1])
}

// What is scheduled to happen on this policy. Read-only apart from cancelling
// a queued send - reminders appear here on their own, per the rules an admin
// configures under Admin -> Reminders.
export function PolicyActivities({
  policyId,
  getPolicyActivitiesFn = getPolicyActivities,
  cancelScheduledEmailFn = cancelScheduledEmail,
}: PolicyActivitiesProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isPending, isError } = useQuery({
    queryKey: ['policyActivities', policyId],
    queryFn: ({ signal }) => getPolicyActivitiesFn(policyId, signal),
  })

  const cancel = useMutation({
    mutationFn: (id: number) => cancelScheduledEmailFn(id),
    onSuccess: () => {
      toast.success('Reminder cancelled')
      return queryClient.invalidateQueries({ queryKey: ['policyActivities', policyId] })
    },
    onError: (error) => toast.error(error.message),
  })

  const activities = data?.activities

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activities</CardTitle>
        <CardDescription>
          Reminders scheduled for this policy, and ones already sent.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load activities.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
        {!isPending && !isError && activities && activities.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing scheduled. Renewal reminders are added automatically from the rules an
            admin sets up under Admin → Reminders.
          </p>
        )}
        {!isPending &&
          !isError &&
          activities?.map((activity) => {
            const when = activity.sentAt ?? activity.scheduledFor
            return (
              <div
                key={activity.id}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{activity.title}</p>
                  {activity.detail && (
                    <p className="truncate text-xs text-muted-foreground">{activity.detail}</p>
                  )}
                  {activity.lastError && (
                    <p className="truncate text-xs text-destructive">{activity.lastError}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right">
                    <span
                      className={cn(
                        'block text-xs capitalize',
                        SCHEDULED_EMAIL_STATUS_TEXT_CLASS[activity.status]
                      )}
                    >
                      {SCHEDULED_EMAIL_STATUS_LABEL[activity.status]}
                    </span>
                    <span
                      className="block text-xs text-muted-foreground"
                      title={formatLogTimestamp(when)}
                    >
                      {formatRelativeDays(when)}
                    </span>
                  </div>
                  {activity.cancellable && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(scheduledEmailId(activity))}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
      </CardContent>
    </Card>
  )
}
