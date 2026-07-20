import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { updateClient, type ClientDetail } from '@/api/clients'
import { updatePerson } from '@/api/persons'
import { AddClientForm, type ClientFormSubmit } from '@/components/clients/add-client-dialog'

interface EditClientDialogProps {
  client: Omit<ClientDetail, 'policies'>
  updateClientFn?: typeof updateClient
  updatePersonFn?: typeof updatePerson
}

export function EditClientDialog({
  client,
  updateClientFn = updateClient,
  updatePersonFn = updatePerson,
}: EditClientDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (payload: ClientFormSubmit) => {
      // Person first: the client PATCH response's nested `namedInsured`
      // reflects the update, so a single cache write below stays consistent.
      await updatePersonFn(client.namedInsuredId, payload.person)
      return updateClientFn(client.id, payload.client)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['clients', client.id], data)
      setOpen(false)
    },
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
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>Update the named insured, addresses, and contact info.</DialogDescription>
        </DialogHeader>
        <AddClientForm
          initial={client}
          submitLabel="Save"
          onSubmit={(payload) => mutation.mutate(payload)}
          onCancel={() => setOpen(false)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
        />
      </DialogContent>
    </Dialog>
  )
}
