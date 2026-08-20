import { useMutation, useQueryClient } from '@tanstack/react-query'
import { deleteReminderRule, type ReminderRule } from '@/api/reminders'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

interface DeleteReminderRuleDialogProps {
  rule: ReminderRule | null
  onOpenChange: (open: boolean) => void
  deleteReminderRuleFn?: typeof deleteReminderRule
}

// Controlled by the list: `rule` doubles as open state, matching the
// correspondence-template delete dialog.
export function DeleteReminderRuleDialog({
  rule,
  onOpenChange,
  deleteReminderRuleFn = deleteReminderRule,
}: DeleteReminderRuleDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: (id: number) => deleteReminderRuleFn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
      queryClient.invalidateQueries({ queryKey: ['scheduledEmails'] })
      onOpenChange(false)
      toast.success('Rule deleted')
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog
      open={rule !== null}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete rule</DialogTitle>
          <DialogDescription>
            Delete “{rule?.name}”? Any reminders it has queued but not yet sent are dropped too.
            Reminders already sent stay in the policy log and the email log.
          </DialogDescription>
        </DialogHeader>
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
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => rule && mutation.mutate(rule.id)}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
