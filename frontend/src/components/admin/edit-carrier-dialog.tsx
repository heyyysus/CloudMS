import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateCarrier, type Carrier } from '@/api/carriers'
import { CarrierForm } from '@/components/admin/carrier-form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/toast'

interface EditCarrierDialogProps {
  carrier: Carrier | null
  onOpenChange: (open: boolean) => void
  updateCarrierFn?: typeof updateCarrier
}

// Controlled by the list: one dialog serves every row, so `carrier` doubles as
// the open state.
export function EditCarrierDialog({
  carrier,
  onOpenChange,
  updateCarrierFn = updateCarrier,
}: EditCarrierDialogProps) {
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateCarrier>[1] }) =>
      updateCarrierFn(id, body),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] })
      onOpenChange(false)
      toast.success(`${updated.name} updated`)
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Dialog
      open={carrier !== null}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) mutation.reset()
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit carrier</DialogTitle>
          <DialogDescription>
            Setting a carrier inactive hides it from new policies; policies already on it keep
            showing it.
          </DialogDescription>
        </DialogHeader>
        {carrier && (
          // Keyed so switching rows rebuilds the form with that carrier's
          // values rather than keeping the previous row's state.
          <CarrierForm
            key={carrier.id}
            initial={carrier}
            submitLabel="Save"
            pendingLabel="Saving…"
            onSubmit={(body) => mutation.mutate({ id: carrier.id, body })}
            onCancel={() => onOpenChange(false)}
            isPending={mutation.isPending}
            errorMessage={mutation.isError ? mutation.error.message : null}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
