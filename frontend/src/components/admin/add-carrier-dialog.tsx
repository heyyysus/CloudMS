import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { createCarrier } from '@/api/carriers'
import { CarrierForm } from '@/components/admin/carrier-form'
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

interface AddCarrierDialogProps {
  createCarrierFn?: typeof createCarrier
}

export function AddCarrierDialog({ createCarrierFn = createCarrier }: AddCarrierDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()

  const mutation = useMutation({
    mutationFn: createCarrierFn,
    onSuccess: (carrier) => {
      // Same ['carriers'] key the policy forms read, so a new carrier shows up
      // in their picker without any extra wiring.
      queryClient.invalidateQueries({ queryKey: ['carriers'] })
      setOpen(false)
      toast.success(`${carrier.name} added`)
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
          <Plus /> Add carrier
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add carrier</DialogTitle>
          <DialogDescription>
            Carriers added here become available in every policy's carrier picker.
          </DialogDescription>
        </DialogHeader>
        {/* Remounts on each open so a cancelled draft isn't still sitting
            there the next time the dialog is used. */}
        {open && (
          <CarrierForm
            submitLabel="Add carrier"
            pendingLabel="Adding…"
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
