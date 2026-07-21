import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Field, FieldError } from '@/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createPolicyLog, type PolicyLog } from '@/api/policyLogs'

const logFormSchema = z.object({
  body: z.string().trim().min(1, 'Enter a note').max(5000, 'Max 5000 characters'),
})

type LogFormValues = z.infer<typeof logFormSchema>

interface AddLogFormProps {
  onSubmit: (body: string) => void
  onCancel?: () => void
  isPending?: boolean
  errorMessage?: string | null
}

export function AddLogForm({ onSubmit, onCancel, isPending, errorMessage }: AddLogFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LogFormValues>({
    resolver: zodResolver(logFormSchema),
    defaultValues: { body: '' },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => onSubmit(values.body.trim()))}
      noValidate
    >
      <Field data-invalid={!!errors.body}>
        <Textarea
          id="log-form-body"
          rows={4}
          autoFocus
          placeholder="What happened?"
          {...register('body')}
        />
        <FieldError errors={errors.body ? [errors.body] : undefined} />
      </Field>

      {errorMessage && (
        <div role="alert" className="mt-2 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <DialogFooter className="mt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Add log'}
        </Button>
      </DialogFooter>
    </form>
  )
}

interface AddLogDialogProps {
  policyId: number
  open: boolean
  onOpenChange: (open: boolean) => void
  createLogFn?: typeof createPolicyLog
}

// Controlled by the parent (ClientDetail): opened either by the "Add log"
// button on a PolicyLogs section or by the Cmd/Ctrl+L shortcut, both of
// which target whichever policy is currently selected.
export function AddLogDialog({
  policyId,
  open,
  onOpenChange,
  createLogFn = createPolicyLog,
}: AddLogDialogProps) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (body: string) => createLogFn({ policyId, body }),
    onSuccess: (data) => {
      queryClient.setQueryData<PolicyLog[]>(['policyLogs', policyId], (old) => [
        data,
        ...(old ?? []),
      ])
      onOpenChange(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add log</DialogTitle>
          <DialogDescription>Add a note to this policy.</DialogDescription>
        </DialogHeader>
        <AddLogForm
          onSubmit={(body) => mutation.mutate(body)}
          onCancel={() => onOpenChange(false)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
        />
      </DialogContent>
    </Dialog>
  )
}
