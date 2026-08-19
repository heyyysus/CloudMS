import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  updateCorrespondenceTemplate,
  type CorrespondenceTemplate,
} from '@/api/correspondenceTemplates'
import { CorrespondenceTemplateForm } from '@/components/admin/correspondence-template-form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

interface EditCorrespondenceTemplateDialogProps {
  template: CorrespondenceTemplate | null
  mergeFields: string[]
  previewAgent?: { name: string | null; email: string }
  onOpenChange: (open: boolean) => void
  updateCorrespondenceTemplateFn?: typeof updateCorrespondenceTemplate
}

// Controlled by the list: one dialog serves every row, so `template` doubles as
// the open state.
export function EditCorrespondenceTemplateDialog({
  template,
  mergeFields,
  previewAgent,
  onOpenChange,
  updateCorrespondenceTemplateFn = updateCorrespondenceTemplate,
}: EditCorrespondenceTemplateDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateCorrespondenceTemplate>[1] }) =>
      updateCorrespondenceTemplateFn(id, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['correspondenceTemplates'] })
      onOpenChange(false)
      toast.success(`${updated.name} updated`)
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog
      open={template !== null}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
          <DialogDescription>Update this correspondence template.</DialogDescription>
        </DialogHeader>
        {template && (
          // Keyed so switching rows rebuilds the form with that template's
          // values rather than keeping the previous row's state.
          <CorrespondenceTemplateForm
            key={template.id}
            initial={template}
            mergeFields={mergeFields}
            previewAgent={previewAgent}
            submitLabel="Save"
            pendingLabel="Saving…"
            onSubmit={(body) => mutation.mutate({ id: template.id, body })}
            onCancel={() => onOpenChange(false)}
            isPending={mutation.isPending}
            errorMessage={mutation.isError ? mutation.error.message : null}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
