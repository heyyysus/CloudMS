import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  AddClientForm,
  type ClientFormSubmit,
  type ClientFormValues,
} from '@/components/clients/add-client-dialog'
import {
  AddPolicyForm,
  deriveTerm,
  type AddPolicyFormValues,
  type ExistingDriverOption,
} from '@/components/clients/add-policy-dialog'
import { createPerson } from '@/api/persons'
import { createClient, clientDisplayName, type ClientDetail } from '@/api/clients'
import { createPolicy, getCarriers, type CreatePolicyBody } from '@/api/policies'
import { createPolicyLog } from '@/api/policyLogs'
import { search as defaultSearch, type SearchClientResult, type SearchFn } from '@/api/search'
import { DEFAULT_BI_LIMIT, DEFAULT_PD_LIMIT } from '@/lib/coverage-options'
import { formatNameLastFirst } from '@/lib/person-name'
import { formatPhone } from '@/lib/phone'
import {
  parseIntegrationFile,
  IntegrationFileParseError,
  type ParsedDriver,
  type ParsedQuote,
} from '@/lib/integration-file'

type ClientOption = Omit<ClientDetail, 'policies'>

interface ImportQuoteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // The dropped file. The parent is expected to remount this component (via
  // a `key` bump) for each new drop, mirroring AddAttachmentDialog's
  // `initialFile` convention — this component parses once, on mount.
  file?: File
  // Set when the file was dropped on a specific client's page: preselects
  // the "existing client" path with that client, skipping the search step.
  defaultClient?: ClientOption
  onImported: (client: ClientOption) => void
  parseFn?: (raw: string) => ParsedQuote
  searchFn?: SearchFn
  createPersonFn?: typeof createPerson
  createClientFn?: typeof createClient
  createPolicyFn?: typeof createPolicy
  getCarriersFn?: typeof getCarriers
  createPolicyLogFn?: typeof createPolicyLog
}

function summarize(parsed: ParsedQuote): string {
  const name = `${parsed.insured.firstName} ${parsed.insured.lastName}`.trim() || 'Unknown insured'
  const vehicleCount = parsed.vehicles.length
  const driverCount = 1 + parsed.additionalDrivers.length
  return `${name} · ${vehicleCount} vehicle${vehicleCount === 1 ? '' : 's'} · ${driverCount} driver${driverCount === 1 ? '' : 's'}`
}

function namesMatch(a: { firstName: string; lastName: string }, b: { firstName: string; lastName: string }) {
  return (
    a.firstName.trim().toLowerCase() === b.firstName.trim().toLowerCase() &&
    a.lastName.trim().toLowerCase() === b.lastName.trim().toLowerCase()
  )
}

// Matches parsed people (the insured + any additional drivers) against the
// client's existing driver options by name. A match gets checked in the
// existing-drivers list; anything unmatched becomes a new driver row. For a
// just-created client this always matches the insured (the name came from
// the same parsed data), so the same logic serves both the new- and
// existing-client paths without a special case.
function matchDrivers(
  options: ExistingDriverOption[],
  parsed: ParsedQuote
): { matchedPersonIds: Set<number>; unmatched: ParsedDriver[] } {
  const matchedPersonIds = new Set<number>()
  const unmatched: ParsedDriver[] = []
  for (const person of [parsed.insured, ...parsed.additionalDrivers]) {
    const match = options.find((option) => namesMatch(option.person, person))
    if (match) matchedPersonIds.add(match.personId)
    else unmatched.push(person)
  }
  return { matchedPersonIds, unmatched }
}

// Mirrors toFormValues's existingDrivers mapping in add-policy-dialog.tsx —
// this REPLACES that array wholesale via initialValues (a shallow merge, not
// a deep one), so it has to reproduce every field, not just `checked`.
function buildExistingDriverRows(
  options: ExistingDriverOption[],
  matchedPersonIds: Set<number>
): AddPolicyFormValues['existingDrivers'] {
  return options.map((option) => ({
    checked: matchedPersonIds.has(option.personId),
    personId: option.personId,
    label: formatNameLastFirst(option.person),
    hasDriverRow: !!option.driver,
    dlNumber: option.driver?.dlNumber ?? '',
    rating: option.driver?.rating === 'excluded' ? 'excluded' : 'rated',
    sr22: option.driver?.sr22 ?? false,
  }))
}

function buildNewDriverRows(drivers: ParsedDriver[]): AddPolicyFormValues['newDrivers'] {
  return drivers.map((driver) => ({
    firstName: driver.firstName,
    lastName: driver.lastName,
    dateOfBirth: driver.dateOfBirth,
    gender: driver.gender,
    relationToInsured: driver.relationToInsured,
    maritalStatus: driver.maritalStatus,
    dlNumber: driver.dlNumber,
    rating: 'rated',
    sr22: false,
  }))
}

function buildClientInitialValues(parsed: ParsedQuote): Partial<ClientFormValues> {
  return {
    person: {
      firstName: parsed.insured.firstName,
      lastName: parsed.insured.lastName,
      dateOfBirth: parsed.insured.dateOfBirth,
      gender: parsed.insured.gender,
      maritalStatus: parsed.insured.maritalStatus,
    },
    mailing: {
      address1: parsed.insured.address1,
      address2: '',
      city: parsed.insured.city,
      state: parsed.insured.state,
      zip: parsed.insured.zip,
    },
    phones: parsed.insured.phone ? [{ value: parsed.insured.phone }] : [],
    emails: parsed.insured.email ? [{ value: parsed.insured.email }] : [],
  }
}

function buildPolicyInitialValues(
  parsed: ParsedQuote,
  existingDriverRows: AddPolicyFormValues['existingDrivers'],
  newDriverRows: AddPolicyFormValues['newDrivers']
): Partial<AddPolicyFormValues> {
  const values: Partial<AddPolicyFormValues> = {
    // Carrier and policy number are never present in a rater file — left
    // empty and required, same as a blank Add Policy form.
    defaultCoverages: {
      bi: parsed.defaultCoverages.bi || DEFAULT_BI_LIMIT,
      pd: parsed.defaultCoverages.pd || DEFAULT_PD_LIMIT,
      umbi: parsed.defaultCoverages.umbi,
      umpd: parsed.defaultCoverages.umpd,
      medpay: parsed.defaultCoverages.medpay,
    },
    vehicles: parsed.vehicles.map((vehicle) => ({
      vin: vehicle.vin,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      garagingZip: vehicle.garagingZip,
      coll: vehicle.coll,
      comp: vehicle.comp,
      cdwWaived: false,
      rental: vehicle.rental,
      towing: vehicle.towing,
    })),
    existingDrivers: existingDriverRows,
    newDrivers: newDriverRows,
  }
  if (parsed.effectiveDate) values.effectiveDate = parsed.effectiveDate
  if (parsed.effectiveDate && parsed.expirationDate) {
    values.expirationDate = parsed.expirationDate
    values.term = deriveTerm(parsed.effectiveDate, parsed.expirationDate)
  }
  return values
}

function ExistingClientSearch({
  initialQuery,
  searchFn,
  onSelect,
}: {
  initialQuery: string
  searchFn: SearchFn
  onSelect: (client: SearchClientResult) => void
}) {
  const [input, setInput] = useState(initialQuery)
  const debounced = useDebouncedValue(input, 250)
  const q = debounced.trim()

  const { data, isFetching } = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => searchFn(q, signal),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
  })
  const clients = data?.clients ?? []

  return (
    <Command shouldFilter={false} className="rounded-lg border">
      <CommandInput value={input} onValueChange={setInput} placeholder="Search clients…" />
      <CommandList>
        {q.length < 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Type at least 2 characters to search…
          </div>
        )}
        {q.length >= 2 && isFetching && !data && (
          <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
        )}
        {q.length >= 2 && data && clients.length === 0 && <CommandEmpty>No clients found.</CommandEmpty>}
        {clients.length > 0 && (
          <CommandGroup>
            {clients.map((client) => (
              <CommandItem key={client.id} value={String(client.id)} onSelect={() => onSelect(client)}>
                <div className="flex flex-col">
                  <span>{formatNameLastFirst(client.namedInsured)}</span>
                  <span className="text-xs text-muted-foreground">
                    {client.emails[0]?.email ?? formatPhone(client.phones[0]?.phoneNumber) ?? ''}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}

function buildExistingDriverOptions(client: ClientOption): ExistingDriverOption[] {
  const options: ExistingDriverOption[] = [{ personId: client.namedInsuredId, person: client.namedInsured }]
  if (client.secondNamedInsured) {
    options.push({ personId: client.secondNamedInsured.id, person: client.secondNamedInsured })
  }
  return options
}

export function ImportQuoteDialog({
  open,
  onOpenChange,
  file,
  defaultClient,
  onImported,
  parseFn = parseIntegrationFile,
  searchFn = defaultSearch,
  createPersonFn = createPerson,
  createClientFn = createClient,
  createPolicyFn = createPolicy,
  getCarriersFn = getCarriers,
  createPolicyLogFn = createPolicyLog,
}: ImportQuoteDialogProps) {
  const queryClient = useQueryClient()

  const [step, setStep] = useState<'parse' | 'target' | 'policy'>('parse')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedQuote | null>(null)
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>(defaultClient ? 'existing' : 'new')
  const [searchingDifferent, setSearchingDifferent] = useState(false)
  const [client, setClient] = useState<ClientOption | null>(null)

  // Parses once, on mount — the parent remounts this dialog (via a `key`
  // bump) for each newly dropped file, mirroring AddAttachmentDialog.
  useEffect(() => {
    if (!file) return
    let cancelled = false
    file
      .text()
      .then((raw) => {
        if (cancelled) return
        try {
          setParsed(parseFn(raw))
          setStep('target')
        } catch (err) {
          setParseError(err instanceof IntegrationFileParseError ? err.message : 'Could not parse this file.')
        }
      })
      .catch(() => {
        if (!cancelled) setParseError('Could not read this file.')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const carriersQuery = useQuery({
    queryKey: ['carriers'],
    queryFn: ({ signal }) => getCarriersFn(signal),
    enabled: step === 'policy',
  })

  const createClientMutation = useMutation({
    mutationFn: async (payload: ClientFormSubmit) => {
      // If createClientFn fails here, the person row is orphaned; the user
      // can just retry, which creates a fresh person — same caveat as
      // AddClientDialog's own new-client mutation.
      const person = await createPersonFn(payload.person)
      return createClientFn({ ...payload.client, namedInsuredId: person.id })
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['clients', data.id], data)
      setClient(data)
      setStep('policy')
    },
  })

  const importPolicyMutation = useMutation({
    mutationFn: async (body: CreatePolicyBody) => {
      const policy = await createPolicyFn(body)
      try {
        await createPolicyLogFn({
          policyId: policy.id,
          body: `Policy imported from rater file "${file?.name ?? 'unknown'}".`,
        })
      } catch {
        // Best-effort: a failed log entry must not fail the import.
      }
      return policy
    },
    onSuccess: (policy) => {
      if (!client) return
      queryClient.setQueryData(['policies', policy.id], policy)
      queryClient.setQueryData<ClientDetail>(['clients', client.id], (old) =>
        old ? { ...old, policies: [...old.policies, policy] } : old
      )
      onOpenChange(false)
      onImported(client)
    },
  })

  function selectClient(next: ClientOption) {
    setClient(next)
    setSearchingDifferent(false)
    setStep('policy')
  }

  const title = step === 'policy' && client ? `Import policy for ${clientDisplayName(client)}` : 'Import rater file'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {parsed ? summarize(parsed) : 'Reading the dropped file…'}
          </DialogDescription>
        </DialogHeader>

        {step === 'parse' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            {parseError ? (
              <>
                <p className="text-sm text-destructive">{parseError}</p>
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Reading file…</p>
              </>
            )}
          </div>
        )}

        {step === 'target' && parsed && (
          <div className="flex flex-col gap-4">
            <Tabs value={targetMode} onValueChange={(next) => setTargetMode(next as 'new' | 'existing')}>
              <TabsList>
                <TabsTrigger value="new">New client</TabsTrigger>
                <TabsTrigger value="existing">Existing client</TabsTrigger>
              </TabsList>
            </Tabs>

            {targetMode === 'new' ? (
              <AddClientForm
                initialValues={buildClientInitialValues(parsed)}
                submitLabel="Create client & continue"
                onSubmit={(payload) => createClientMutation.mutate(payload)}
                onCancel={() => onOpenChange(false)}
                isPending={createClientMutation.isPending}
                errorMessage={createClientMutation.isError ? createClientMutation.error.message : null}
              />
            ) : defaultClient && !searchingDifferent ? (
              <div className="flex flex-col gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{formatNameLastFirst(defaultClient.namedInsured)}</p>
                  <p className="text-sm text-muted-foreground">Import this policy onto this client.</p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => selectClient(defaultClient)}>Continue</Button>
                  <Button variant="outline" onClick={() => setSearchingDifferent(true)}>
                    Search a different client
                  </Button>
                </div>
              </div>
            ) : (
              <ExistingClientSearch
                initialQuery={parsed.insured.lastName}
                searchFn={searchFn}
                onSelect={selectClient}
              />
            )}
          </div>
        )}

        {step === 'policy' && parsed && client && (
          <>
            {(() => {
              const existingDriverOptions = buildExistingDriverOptions(client)
              const { matchedPersonIds, unmatched } = matchDrivers(existingDriverOptions, parsed)
              const existingDriverRows = buildExistingDriverRows(existingDriverOptions, matchedPersonIds)
              const newDriverRows = buildNewDriverRows(unmatched)
              return (
                <AddPolicyForm
                  clientId={client.id}
                  client={client}
                  carriers={carriersQuery.data ?? []}
                  carriersLoading={carriersQuery.isPending}
                  existingVehicles={[]}
                  existingDrivers={existingDriverOptions}
                  initialValues={buildPolicyInitialValues(parsed, existingDriverRows, newDriverRows)}
                  submitLabel="Import policy"
                  onSubmit={(body) => importPolicyMutation.mutate(body)}
                  onCancel={() => onOpenChange(false)}
                  isPending={importPolicyMutation.isPending}
                  errorMessage={importPolicyMutation.isError ? importPolicyMutation.error.message : null}
                />
              )
            })()}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export type { ClientOption }
