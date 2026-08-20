import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  deleteCorrespondenceTemplate,
  type CorrespondenceTemplate,
} from '@/api/correspondenceTemplates'
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

interface DeleteCorrespondenceTemplateDialogProps {
  template: CorrespondenceTemplate | null
  onOpenChange: (open: boolean) => void
  deleteCorrespondenceTemplateFn?: typeof deleteCorrespondenceTemplate
}

// No AlertDialog primitive exists in the repo, so the confirm step is a plain
// controlled Dialog. Controlled by the list: `template` doubles as open state.
export function DeleteCorrespondenceTemplateDialog({
  template,
  onOpenChange,
  deleteCorrespondenceTemplateFn = deleteCorrespondenceTemplate,
}: DeleteCorrespondenceTemplateDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: (id: number) => deleteCorrespondenceTemplateFn(id),
    onSuccess: (_result, _id) => {
      queryClient.invalidateQueries({ queryKey: ['correspondenceTemplates'] })
      onOpenChange(false)
      toast.success('Template deleted')
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete template</DialogTitle>
          <DialogDescription>
            Delete “{template?.name}”? This can’t be undone.
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
            onClick={() => template && mutation.mutate(template.id)}
          >
            {mutation.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
