import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CorrespondenceTemplate } from '@/api/correspondenceTemplates'
import { updateReminderRule, type ReminderRule } from '@/api/reminders'
import { ReminderRuleForm } from '@/components/admin/reminder-rule-form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

interface EditReminderRuleDialogProps {
  rule: ReminderRule | null
  templates: CorrespondenceTemplate[]
  onOpenChange: (open: boolean) => void
  updateReminderRuleFn?: typeof updateReminderRule
}

export function EditReminderRuleDialog({
  rule,
  templates,
  onOpenChange,
  updateReminderRuleFn = updateReminderRule,
}: EditReminderRuleDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof updateReminderRuleFn>[1]) =>
      updateReminderRuleFn(rule!.id, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
      onOpenChange(false)
      toast.success(`${updated.name} updated`)
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
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit reminder rule</DialogTitle>
          <DialogDescription>
            Changes apply to reminders queued from now on; anything already scheduled keeps its
            original send time.
          </DialogDescription>
        </DialogHeader>
        {/* Keyed on the rule so switching rows resets the form to that row's
            values rather than keeping the previous one's. */}
        {rule && (
          <ReminderRuleForm
            key={rule.id}
            initial={rule}
            templates={templates}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            onSubmit={(body) => mutation.mutate(body)}
            onCancel={() => onOpenChange(false)}
            isPending={mutation.isPending}
            errorMessage={mutation.isError ? mutation.error.message : null}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
