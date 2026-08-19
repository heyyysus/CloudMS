import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PencilIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { ClientDetail } from '@/api/clients'
import { getCarriers } from '@/api/carriers'
import {
  updatePolicy,
  type PolicyDetail,
  type UpdatePolicyBody,
  type Vehicle,
} from '@/api/policies'
import { AddPolicyForm, type ExistingDriverOption } from '@/components/clients/add-policy-dialog'
import { useToast } from '@/components/ui/toast'

interface EditPolicyDialogProps {
  client: ClientDetail
  policy: PolicyDetail
  existingVehicles: Vehicle[]
  existingDrivers: ExistingDriverOption[]
  updatePolicyFn?: typeof updatePolicy
  getCarriersFn?: typeof getCarriers
}

export function EditPolicyDialog({
  client,
  policy,
  existingVehicles,
  existingDrivers,
  updatePolicyFn = updatePolicy,
  getCarriersFn = getCarriers,
}: EditPolicyDialogProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const toast = useToast()

  const carriersQuery = useQuery({
    queryKey: ['carriers'],
    queryFn: ({ signal }) => getCarriersFn(signal),
    enabled: open,
  })

  const mutation = useMutation({
    mutationFn: (body: UpdatePolicyBody) => updatePolicyFn(policy.id, body),
    onSuccess: (data) => {
      queryClient.setQueryData(['policies', data.id], data)
      queryClient.setQueryData<ClientDetail>(['clients', client.id], (old) =>
        old
          ? { ...old, policies: old.policies.map((p) => (p.id === data.id ? data : p)) }
          : old
      )
      // The server auto-generates a policy log entry and a change-form
      // attachment for this edit, and links them together; refetch the logs,
      // the attachments, and the log↔attachment join so the new log, the form,
      // and the paperclip link between them all show up without a page reload.
      queryClient.invalidateQueries({ queryKey: ['policyLogs', policy.id] })
      queryClient.invalidateQueries({ queryKey: ['policyAttachments', policy.id] })
      queryClient.invalidateQueries({ queryKey: ['policyLogAttachments', policy.id] })
      setOpen(false)
      toast.success('Policy changes applied')
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
        <Button variant="white" size="sm">
          <PencilIcon /> Endorse
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Endorse policy</DialogTitle>
          <DialogDescription>
            Endorse the policy, its vehicles, and its drivers.
          </DialogDescription>
        </DialogHeader>
        <AddPolicyForm
          clientId={client.id}
          client={client}
          carriers={carriersQuery.data ?? []}
          carriersLoading={carriersQuery.isPending}
          existingVehicles={existingVehicles}
          existingDrivers={existingDrivers}
          initial={policy}
          submitLabel="Save"
          onSubmit={(body) => mutation.mutate(body)}
          onCancel={() => setOpen(false)}
          isPending={mutation.isPending}
          errorMessage={mutation.isError ? mutation.error.message : null}
        />
      </DialogContent>
    </Dialog>
  )
}
