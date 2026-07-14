import { useEffect, useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { FileText, User } from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { clientDisplayName } from '@/api/clients'
import { search as defaultSearch, type SearchClientResult, type SearchPolicyResult } from '@/api/search'
import type { SearchFn } from '@/api/search'

interface SearchPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectClient: (client: SearchClientResult) => void
  onSelectPolicy: (policy: SearchPolicyResult) => void
  searchFn?: SearchFn
}

export function SearchPalette({
  open,
  onOpenChange,
  onSelectClient,
  onSelectPolicy,
  searchFn = defaultSearch,
}: SearchPaletteProps) {
  const [input, setInput] = useState('')
  const debouncedInput = useDebouncedValue(input, 250)
  const q = debouncedInput.trim()

  useEffect(() => {
    if (!open) setInput('')
  }, [open])

  const { data, isFetching, isError } = useQuery({
    queryKey: ['search', q],
    queryFn: ({ signal }) => searchFn(q, signal),
    enabled: open && q.length >= 2,
    placeholderData: keepPreviousData,
  })

  const clients = data?.clients ?? []
  const policies = data?.policies ?? []
  const hasResults = clients.length > 0 || policies.length > 0

  function handleSelectClient(client: SearchClientResult) {
    onOpenChange(false)
    onSelectClient(client)
  }

  function handleSelectPolicy(policy: SearchPolicyResult) {
    onOpenChange(false)
    onSelectPolicy(policy)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search"
      description="Search for a client or policy"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={input}
          onValueChange={setInput}
          placeholder="Search clients or policies..."
        />
        <CommandList>
          {q.length < 2 && (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search…
            </div>
          )}
          {q.length >= 2 && isFetching && !data && (
            <div className="py-6 text-center text-sm text-muted-foreground">Searching…</div>
          )}
          {q.length >= 2 && isError && (
            <div className="py-6 text-center text-sm text-destructive">Search failed.</div>
          )}
          {q.length >= 2 && !isError && data && !hasResults && (
            <CommandEmpty>No results for "{q}".</CommandEmpty>
          )}
          {clients.length > 0 && (
            <CommandGroup heading="Clients">
              {clients.map((client) => (
                <CommandItem
                  key={`client-${client.id}`}
                  value={`client-${client.id}`}
                  onSelect={() => handleSelectClient(client)}
                >
                  <User />
                  <div className="flex flex-col">
                    <span>{clientDisplayName(client)}</span>
                    <span className="text-xs text-muted-foreground">
                      {client.emails[0]?.email ?? client.phones[0]?.phoneNumber ?? ''}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {clients.length > 0 && policies.length > 0 && <CommandSeparator />}
          {policies.length > 0 && (
            <CommandGroup heading="Policies">
              {policies.map((policy) => (
                <CommandItem
                  key={`policy-${policy.id}`}
                  value={`policy-${policy.id}`}
                  onSelect={() => handleSelectPolicy(policy)}
                >
                  <FileText />
                  <div className="flex flex-col">
                    <span>{policy.policyNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {policy.clientName} · {policy.status}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
