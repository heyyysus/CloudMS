import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import type { CorrespondenceTemplate } from '@/api/correspondenceTemplates'
import { createReminderRule } from '@/api/reminders'
import { ReminderRuleForm } from '@/components/admin/reminder-rule-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

interface AddReminderRuleDialogProps {
  templates: CorrespondenceTemplate[]
  createReminderRuleFn?: typeof createReminderRule
}

export function AddReminderRuleDialog({
  templates,
  createReminderRuleFn = createReminderRule,
}: AddReminderRuleDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: createReminderRuleFn,
    onSuccess: (rule) => {
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] })
      setOpen(false)
      toast.success(`${rule.name} created — turn it on to start sending`)
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={templates.length === 0}>
          <Plus /> New rule
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New reminder rule</DialogTitle>
          <DialogDescription>
            Sends a correspondence template automatically, a set number of days from a policy's
            expiration date. New rules start turned off.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ReminderRuleForm
            templates={templates}
            submitLabel="Create rule"
            pendingLabel="Creating…"
            onSubmit={(body) => mutation.mutate(body)}
            onCancel={() => setOpen(false)}
            isPending={mutation.isPending}
            errorMessage={mutation.isError ? mutation.error.message : null}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
