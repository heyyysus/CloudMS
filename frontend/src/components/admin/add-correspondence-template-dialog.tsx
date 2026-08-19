import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createCorrespondenceTemplate } from '@/api/correspondenceTemplates'
import { CorrespondenceTemplateForm } from '@/components/admin/correspondence-template-form'
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

interface AddCorrespondenceTemplateDialogProps {
  mergeFields: string[]
  previewAgent?: { name: string | null; email: string }
  createCorrespondenceTemplateFn?: typeof createCorrespondenceTemplate
}

export function AddCorrespondenceTemplateDialog({
  mergeFields,
  previewAgent,
  createCorrespondenceTemplateFn = createCorrespondenceTemplate,
}: AddCorrespondenceTemplateDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: createCorrespondenceTemplateFn,
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ['correspondenceTemplates'] })
      setOpen(false)
      toast.success(`${template.name} created`)
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
        <Button size="sm">
          <Plus /> New template
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New correspondence template</DialogTitle>
          <DialogDescription>
            Compose a reusable email. Insert merge fields for client, policy, and your own details.
          </DialogDescription>
        </DialogHeader>
        {/* Remounts on each open so a cancelled draft isn't still sitting there
            the next time the dialog is used. */}
        {open && (
          <CorrespondenceTemplateForm
            mergeFields={mergeFields}
            previewAgent={previewAgent}
            submitLabel="Create template"
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
