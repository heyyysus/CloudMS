import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { getCorrespondenceTemplates } from '@/api/correspondenceTemplates'
import {
  createReminderRule,
  deleteReminderRule,
  getReminderRules,
  updateReminderRule,
  type ReminderRule,
} from '@/api/reminders'
import { AddReminderRuleDialog } from '@/components/admin/add-reminder-rule-dialog'
import { DeleteReminderRuleDialog } from '@/components/admin/delete-reminder-rule-dialog'
import { EditReminderRuleDialog } from '@/components/admin/edit-reminder-rule-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { formatOffsetDays } from '@/lib/reminder-options'

interface ManageReminderRulesCardProps {
  getReminderRulesFn?: typeof getReminderRules
  getCorrespondenceTemplatesFn?: typeof getCorrespondenceTemplates
  createReminderRuleFn?: typeof createReminderRule
  updateReminderRuleFn?: typeof updateReminderRule
  deleteReminderRuleFn?: typeof deleteReminderRule
}

export function ManageReminderRulesCard({
  getReminderRulesFn = getReminderRules,
  getCorrespondenceTemplatesFn = getCorrespondenceTemplates,
  createReminderRuleFn = createReminderRule,
  updateReminderRuleFn = updateReminderRule,
  deleteReminderRuleFn = deleteReminderRule,
}: ManageReminderRulesCardProps) {
  const [editing, setEditing] = useState<ReminderRule | null>(null)
  const [deleting, setDeleting] = useState<ReminderRule | null>(null)
  const queryClient = useQueryClient()
  const toast = useToast()

  const { data, isPending, isError } = useQuery({
    queryKey: ['reminderRules'],
    queryFn: ({ signal }) => getReminderRulesFn(signal),
  })

  // The rule form picks from these, so the card owns the fetch rather than
  // each dialog doing its own.
  const { data: templateData } = useQuery({
    queryKey: ['correspondenceTemplates'],
    queryFn: ({ signal }) => getCorrespondenceTemplatesFn(signal),
  })

  const toggle = useMutation({
    mutationFn: (rule: ReminderRule) => updateReminderRuleFn(rule.id, { enabled: !rule.enabled }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
      queryClient.invalidateQueries({ queryKey: ['scheduledEmails'] })
      toast.success(updated.enabled ? `${updated.name} is on` : `${updated.name} is off`)
    },
    onError: (error) => toast.error(error.message),
  })

  const rules = data?.rules ?? []
  const templates = templateData?.templates ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reminder rules</CardTitle>
        <CardAction>
          <AddReminderRuleDialog
            templates={templates}
            createReminderRuleFn={createReminderRuleFn}
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load rules.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {/* A rule needs a template to send, so say that rather than showing an
            Add button that opens a form with an empty picker. */}
        {!isPending && !isError && templates.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create a correspondence template first — a rule sends one of those.
          </p>
        )}
        {!isPending && !isError && rules.length === 0 && templates.length > 0 && (
          <p className="text-sm text-muted-foreground">No rules yet.</p>
        )}
        {!isPending &&
          !isError &&
          rules.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <span className="block truncate font-medium">{rule.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {formatOffsetDays(rule.offsetDays)}
                  {rule.template?.name ? ` · ${rule.template.name}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span
                  className={cn(
                    'text-xs',
                    rule.enabled ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {rule.enabled ? 'On' : 'Off'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate(rule)}
                >
                  {rule.enabled ? 'Turn off' : 'Turn on'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${rule.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setEditing(rule)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(rule)}>
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
      </CardContent>

      <EditReminderRuleDialog
        rule={editing}
        templates={templates}
        onOpenChange={(next) => {
          if (!next) setEditing(null)
        }}
        updateReminderRuleFn={updateReminderRuleFn}
      />
      <DeleteReminderRuleDialog
        rule={deleting}
        onOpenChange={(next) => {
          if (!next) setDeleting(null)
        }}
        deleteReminderRuleFn={deleteReminderRuleFn}
      />
    </Card>
  )
}
