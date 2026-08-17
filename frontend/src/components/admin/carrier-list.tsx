import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal } from 'lucide-react'
import { createCarrier, getCarriers, updateCarrier, type Carrier } from '@/api/carriers'
import { AddCarrierDialog } from '@/components/admin/add-carrier-dialog'
import { EditCarrierDialog } from '@/components/admin/edit-carrier-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

interface ManageCarriersCardProps {
  getCarriersFn?: typeof getCarriers
  createCarrierFn?: typeof createCarrier
  updateCarrierFn?: typeof updateCarrier
}

export function ManageCarriersCard({
  getCarriersFn = getCarriers,
  createCarrierFn = createCarrier,
  updateCarrierFn = updateCarrier,
}: ManageCarriersCardProps) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState<Carrier | null>(null)

  const {
    data: carriers,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['carriers'],
    queryFn: ({ signal }) => getCarriersFn(signal),
  })

  // Activate/deactivate straight from the row; anything else goes through the
  // edit dialog.
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      updateCarrierFn(id, { isActive }),
    onSuccess: (carrier) => {
      queryClient.invalidateQueries({ queryKey: ['carriers'] })
      toast.success(`${carrier.name} ${carrier.isActive ? 'activated' : 'deactivated'}`)
    },
    onError: (error) => toast.error(error.message),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Carriers</CardTitle>
        <CardAction>
          <AddCarrierDialog createCarrierFn={createCarrierFn} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load carriers.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}
        {!isPending && !isError && carriers?.length === 0 && (
          <p className="text-sm text-muted-foreground">No carriers yet.</p>
        )}
        {!isPending &&
          !isError &&
          carriers?.map((carrier) => (
            <div
              key={carrier.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <span
                  className={cn(
                    'block truncate font-medium',
                    !carrier.isActive && 'text-muted-foreground'
                  )}
                >
                  {carrier.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  NAIC {carrier.naic}
                  {carrier.producerCode ? ` · Producer ${carrier.producerCode}` : ''}
                  {carrier.phone ? ` · ${carrier.phone}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {!carrier.isActive && <span className="text-xs text-muted-foreground">Inactive</span>}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${carrier.name}`}>
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setEditing(carrier)}>Edit</DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={toggleActive.isPending}
                      onSelect={() =>
                        toggleActive.mutate({ id: carrier.id, isActive: !carrier.isActive })
                      }
                    >
                      {carrier.isActive ? 'Deactivate' : 'Activate'}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
      </CardContent>

      <EditCarrierDialog
        carrier={editing}
        onOpenChange={(next) => {
          if (!next) setEditing(null)
        }}
        updateCarrierFn={updateCarrierFn}
      />
    </Card>
  )
}
