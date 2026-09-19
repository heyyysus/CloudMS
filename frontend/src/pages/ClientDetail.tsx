import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import { ReceiptIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ClientSummaryCard } from '@/components/clients/client-summary-card'
import { EditClientDialog } from '@/components/clients/edit-client-dialog'
import {
  AddPolicyDialog,
  type ExistingDriverOption,
} from '@/components/clients/add-policy-dialog'
import { EditPolicyDialog } from '@/components/clients/edit-policy-dialog'
import { SendCorrespondenceDialog } from '@/components/clients/send-correspondence-dialog'
import { AddAttachmentDialog } from '@/components/clients/add-attachment-dialog'
import { AddLogDialog } from '@/components/clients/add-log-dialog'
import { PolicyLedger } from '@/components/clients/policy-ledger'
import { ImportQuoteDialog } from '@/components/clients/import-quote-dialog'
import { InvoicePaymentDialog } from '@/components/clients/invoice-payment-dialog'
import { InvoiceReceiptDialog } from '@/components/clients/invoice-receipt-dialog'
import { PolicyAttachments } from '@/components/clients/policy-attachments'
import { PolicyCard } from '@/components/clients/policy-card'
import { PolicyLogs } from '@/components/clients/policy-logs'
import { PolicyActivities } from '@/components/clients/policy-activities'
import { PolicySubtabs, type PolicySubtabValue } from '@/components/clients/policy-subtabs'
import { PolicyTabs } from '@/components/clients/policy-tabs'
import { useClientTabs } from '@/components/layout/client-tabs'
import { useFileDrop, isRaterFile } from '@/hooks/use-file-drop'
import { useLogShortcut } from '@/hooks/use-log-shortcut'
import { useAuth } from '@/auth/AuthContext'
import { ApiError } from '@/api/client'
import { clientDisplayName, getClient } from '@/api/clients'
import { getPolicy, type Vehicle } from '@/api/policies'
import { sortPoliciesByCreatedAt } from '@/lib/policy-status'

function ClientDetail() {
  const params = useParams<{ clientId: string }>()
  const clientId = Number(params.clientId)
  const isValidId = Number.isFinite(clientId)
  const { openTab, removeTab } = useClientTabs()
  const navigate = useNavigate()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const {
    data: client,
    error,
    isPending,
  } = useQuery({
    queryKey: ['clients', clientId],
    queryFn: ({ signal }) => getClient(clientId, signal),
    enabled: isValidId,
  })

  // Refetch the client and all of their policies (plus the per-policy logs and
  // attachments the user sees) on demand. Partial keys match every query with
  // that prefix, so ['policies'] refreshes each ['policies', id] detail query.
  function refreshClient() {
    queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
    queryClient.invalidateQueries({ queryKey: ['policies'] })
    queryClient.invalidateQueries({ queryKey: ['policyLogs'] })
    queryClient.invalidateQueries({ queryKey: ['policyAttachments'] })
    queryClient.invalidateQueries({ queryKey: ['policyLogAttachments'] })
  }

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

  // Tab order is by creation time (oldest → newest); useQueries order still
  // mirrors client.policies, so look queries up by id, never by sorted index.
  const sortedPolicies = sortPoliciesByCreatedAt(client?.policies ?? [])
  const newestPolicyId = sortedPolicies.at(-1)?.id
  const queryByPolicyId = new Map(
    (client?.policies ?? []).map((policy, i) => [policy.id, policyQueries[i]])
  )

  // Selection defaults to the newest policy; a newly created policy becomes
  // the newest and re-takes the selection (render-phase adjust, no effect).
  const [userSelectedId, setUserSelectedId] = useState<number | null>(null)
  const [prevNewestId, setPrevNewestId] = useState(newestPolicyId)
  if (newestPolicyId !== prevNewestId) {
    setPrevNewestId(newestPolicyId)
    setUserSelectedId(null)
  }
  const selectedPolicyId = userSelectedId ?? newestPolicyId
  const selectedPolicy = sortedPolicies.find((policy) => policy.id === selectedPolicyId)

  // Shared across policy tabs (not reset per-policy), so switching policies
  // keeps whichever subtab — Details, Accounting, or Logs — was selected.
  const [subtab, setSubtab] = useState<PolicySubtabValue>('details')

  const [logDialogOpen, setLogDialogOpen] = useState(false)
  useLogShortcut(() => {
    if (selectedPolicyId !== undefined) {
      setSubtab('logs')
      setLogDialogOpen(true)
    }
  })

  // attachmentDialogKey/importDialogKey force a remount (and so a fresh
  // flow) if a file is dropped again while a dialog is already open.
  const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false)
  const [attachmentDialogKey, setAttachmentDialogKey] = useState(0)
  const [droppedFile, setDroppedFile] = useState<File | undefined>(undefined)

  function openAttachmentDialog(file?: File) {
    setDroppedFile(file)
    setAttachmentDialogKey((key) => key + 1)
    setAttachmentDialogOpen(true)
  }

  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importDialogKey, setImportDialogKey] = useState(0)
  const [importFile, setImportFile] = useState<File | undefined>(undefined)
  const [attachmentsHint, setAttachmentsHint] = useState(false)

  function openImportDialog(file: File) {
    setImportFile(file)
    setImportDialogKey((key) => key + 1)
    setImportDialogOpen(true)
  }

  // A rater file (.tt2x/.xml) always opens the import dialog, regardless of
  // whether a policy is selected — importing a client's first policy is the
  // most valuable case, and today's blank-slate ("No policies.") view has
  // no drop target at all. Anything else falls back to the existing
  // attach-to-policy flow, which still requires a selected policy.
  const { isDraggingOver, dragHandlers } = useFileDrop((files) => {
    const file = files[0]
    if (!file) return
    setAttachmentsHint(false)
    if (isRaterFile(file)) {
      openImportDialog(file)
    } else if (selectedPolicyId !== undefined) {
      setSubtab('attachments')
      openAttachmentDialog(file)
    } else {
      setAttachmentsHint(true)
    }
  })

  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false)
  const [invoiceDialogTargetId, setInvoiceDialogTargetId] = useState<number | undefined>(undefined)
  function openInvoiceDialog(invoiceId?: number) {
    setInvoiceDialogTargetId(invoiceId)
    setInvoiceDialogOpen(true)
  }

  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false)
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<number | undefined>(undefined)
  function openReceiptDialog(invoiceId: number) {
    setReceiptInvoiceId(invoiceId)
    setReceiptDialogOpen(true)
  }

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
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="relative flex flex-col gap-6" {...dragHandlers}>
      {isDraggingOver && (
        <div className="pointer-events-none fixed inset-0 z-40 m-4 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5">
          <p className="text-sm font-medium text-primary">
            {selectedPolicyId !== undefined
              ? 'Drop a rater file to import, or a document to attach to the selected policy'
              : 'Drop a rater file to import'}
          </p>
        </div>
      )}
      <ClientSummaryCard
        client={client}
        action={
          <div className="flex gap-2">
            {selectedPolicy && (
              <Button size="sm" variant="white" onClick={() => openInvoiceDialog()}>
                <ReceiptIcon /> New invoice
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={refreshClient}>
              <RefreshCwIcon /> Refresh
            </Button>
            <EditClientDialog client={client} />
          </div>
        }
      />

      {attachmentsHint && (
        <p className="text-sm text-muted-foreground">
          This client has no policies yet — add one before attaching a document.
        </p>
      )}

      <div>
        {sortedPolicies.length === 0 || selectedPolicyId === undefined ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">No policies.</p>
            <AddPolicyDialog
              client={client}
              existingVehicles={existingVehicles}
              existingDrivers={existingDrivers}
            />
          </div>
        ) : (
          <PolicyTabs
            policies={sortedPolicies}
            selectedId={selectedPolicyId}
            onSelect={setUserSelectedId}
            action={
              <AddPolicyDialog
                client={client}
                existingVehicles={existingVehicles}
                existingDrivers={existingDrivers}
              />
            }
          >
            {(policy) => {
              const query = queryByPolicyId.get(policy.id)
              return (
                <PolicySubtabs
                  value={subtab}
                  onValueChange={setSubtab}
                  details={
                    <PolicyCard
                      policy={policy}
                      detail={query?.data}
                      isLoading={query?.isPending}
                      isError={query?.isError}
                      action={
                        query?.data && (
                          <div className="flex gap-2">
                            <SendCorrespondenceDialog
                              client={client}
                              policy={query.data}
                              isAdmin={user?.role === 'admin'}
                            />
                            <EditPolicyDialog
                              client={client}
                              policy={query.data}
                              existingVehicles={existingVehicles}
                              existingDrivers={existingDrivers}
                            />
                          </div>
                        )
                      }
                    />
                  }
                  activities={<PolicyActivities policyId={policy.id} />}
                  accounting={
                    <PolicyLedger
                      clientId={client.id}
                      policyId={policy.id}
                      onPay={(invoiceId) => openInvoiceDialog(invoiceId)}
                      onSelect={(invoiceId) => openReceiptDialog(invoiceId)}
                    />
                  }
                  logs={
                    <PolicyLogs
                      policyId={policy.id}
                      onAddLog={() => setLogDialogOpen(true)}
                      currentUserId={user?.id}
                    />
                  }
                  attachments={
                    <PolicyAttachments
                      policyId={policy.id}
                      onAddAttachment={() => openAttachmentDialog()}
                      currentUserId={user?.id}
                    />
                  }
                />
              )
            }}
          </PolicyTabs>
        )}
      </div>

      {selectedPolicyId !== undefined && (
        <AddLogDialog
          policyId={selectedPolicyId}
          open={logDialogOpen}
          onOpenChange={setLogDialogOpen}
        />
      )}

      {selectedPolicyId !== undefined && (
        <AddAttachmentDialog
          key={attachmentDialogKey}
          policyId={selectedPolicyId}
          open={attachmentDialogOpen}
          onOpenChange={(next) => {
            setAttachmentDialogOpen(next)
            if (!next) setDroppedFile(undefined)
          }}
          initialFile={droppedFile}
        />
      )}

      {importFile && (
        <ImportQuoteDialog
          key={importDialogKey}
          file={importFile}
          defaultClient={client}
          open={importDialogOpen}
          onOpenChange={(next) => {
            setImportDialogOpen(next)
            if (!next) setImportFile(undefined)
          }}
          onImported={(importedClient) => {
            // Usually the same client this page is already showing — the
            // patched query data is enough. If the user switched to a
            // different client (or created a new one) mid-import, follow
            // them there.
            openTab({ id: importedClient.id, label: clientDisplayName(importedClient) })
            if (importedClient.id !== clientId) navigate(`/clients/${importedClient.id}`)
          }}
        />
      )}

      {selectedPolicy && (
        <InvoicePaymentDialog
          client={client}
          policy={selectedPolicy}
          open={invoiceDialogOpen}
          onOpenChange={(next) => {
            setInvoiceDialogOpen(next)
            if (!next) setInvoiceDialogTargetId(undefined)
          }}
          initialInvoiceId={invoiceDialogTargetId}
        />
      )}

      <InvoiceReceiptDialog
        client={client}
        policies={client.policies}
        invoiceId={receiptInvoiceId}
        isAdmin={user?.role === 'admin'}
        open={receiptDialogOpen}
        onOpenChange={(next) => {
          setReceiptDialogOpen(next)
          if (!next) setReceiptInvoiceId(undefined)
        }}
      />
    </div>
  )
}

export default ClientDetail
