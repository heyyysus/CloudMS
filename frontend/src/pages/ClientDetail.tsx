import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { useQuery, useQueries } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientSummaryCard } from '@/components/clients/client-summary-card'
import { EditClientDialog } from '@/components/clients/edit-client-dialog'
import {
  AddPolicyDialog,
  type ExistingDriverOption,
} from '@/components/clients/add-policy-dialog'
import { PolicyCard } from '@/components/clients/policy-card'
import { useClientTabs } from '@/components/layout/client-tabs'
import { ApiError } from '@/api/client'
import { clientDisplayName, getClient } from '@/api/clients'
import { getPolicy, type Vehicle } from '@/api/policies'

function ClientDetail() {
  const params = useParams<{ clientId: string }>()
  const clientId = Number(params.clientId)
  const isValidId = Number.isFinite(clientId)
  const { openTab, removeTab } = useClientTabs()

  const {
    data: client,
    error,
    isPending,
  } = useQuery({
    queryKey: ['clients', clientId],
    queryFn: ({ signal }) => getClient(clientId, signal),
    enabled: isValidId,
  })

  useEffect(() => {
    if (client) {
      openTab({ id: clientId, label: clientDisplayName(client) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client])

  useEffect(() => {
    if (error instanceof ApiError && error.status === 404) {
      removeTab(clientId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error])

  const policyQueries = useQueries({
    queries: (client?.policies ?? []).map((policy) => ({
      queryKey: ['policies', policy.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => getPolicy(policy.id, signal),
    })),
  })

  const policyDetails = policyQueries.map((query) => query.data)

  // Vehicles and people from the client's other policies, offered as prefills
  // in the add-policy dialog. Still-loading policy queries just mean a
  // shorter list.
  const vehiclesByVin = new Map<string, Vehicle>()
  for (const detail of policyDetails) {
    for (const vehicle of detail?.vehicles ?? []) {
      if (!vehiclesByVin.has(vehicle.vin)) vehiclesByVin.set(vehicle.vin, vehicle)
    }
  }
  const existingVehicles = [...vehiclesByVin.values()]

  const driversByPersonId = new Map<number, ExistingDriverOption>()
  if (client) {
    driversByPersonId.set(client.namedInsuredId, {
      personId: client.namedInsuredId,
      person: client.namedInsured,
    })
    if (client.secondNamedInsured) {
      driversByPersonId.set(client.secondNamedInsured.id, {
        personId: client.secondNamedInsured.id,
        person: client.secondNamedInsured,
      })
    }
  }
  for (const detail of policyDetails) {
    for (const policyDriver of detail?.policyDrivers ?? []) {
      const { personId, person, dlNumber, rating, sr22 } = policyDriver.driver
      driversByPersonId.set(personId, { personId, person, driver: { dlNumber, rating, sr22 } })
    }
  }
  const existingDrivers = [...driversByPersonId.values()]

  if (!isValidId || (error instanceof ApiError && error.status === 404)) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Client not found</h1>
        <p className="text-sm text-muted-foreground">
          This client doesn't exist or may have been removed.
        </p>
        <Button asChild variant="outline">
          <Link to="/home">Back to Home</Link>
        </Button>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">{error.message}</p>
      </div>
    )
  }

  if (isPending || !client) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{clientDisplayName(client)}</h1>
        <p className="text-muted-foreground">Client #{client.id}</p>
      </div>

      <ClientSummaryCard client={client} action={<EditClientDialog client={client} />} />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Policies</h2>
          <AddPolicyDialog
            client={client}
            existingVehicles={existingVehicles}
            existingDrivers={existingDrivers}
          />
        </div>
        {client.policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No policies.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {client.policies.map((policy, i) => (
              <PolicyCard
                key={policy.id}
                policy={policy}
                detail={policyQueries[i]?.data}
                isLoading={policyQueries[i]?.isPending}
                isError={policyQueries[i]?.isError}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientDetail
