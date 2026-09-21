import { useState } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { listClients as defaultListClients, type ClientListItem, type ListClientsFn } from '@/api/clients'
import { formatNameLastFirst } from '@/lib/person-name'
import { formatPhone } from '@/lib/phone'

interface ClientListProps {
  onSelectClient: (client: ClientListItem) => void
  listClientsFn?: ListClientsFn
}

export function ClientList({ onSelectClient, listClientsFn = defaultListClients }: ClientListProps) {
  const [input, setInput] = useState('')
  const debouncedInput = useDebouncedValue(input, 250)
  const q = debouncedInput.trim()

  const { data, isPending, isError } = useQuery({
    queryKey: ['clients', q],
    queryFn: ({ signal }) => listClientsFn(q || undefined, signal),
    placeholderData: keepPreviousData,
  })

  const clients = data ?? []

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Search clients..."
        className="h-9 w-full max-w-sm rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <div className="flex flex-col rounded-md border">
        {isPending && <p className="p-4 text-sm text-muted-foreground">Loading clients…</p>}
        {isError && <p className="p-4 text-sm text-destructive">Couldn't load clients.</p>}
        {!isPending && !isError && clients.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {q ? `No clients match "${q}".` : 'No clients yet'}
          </p>
        )}
        {clients.map((client) => (
          <button
            key={client.id}
            type="button"
            onClick={() => onSelectClient(client)}
            className="flex flex-col items-start gap-0.5 border-b px-4 py-3 text-left last:border-b-0 hover:bg-accent"
          >
            <span className="text-sm font-medium">{formatNameLastFirst(client.namedInsured)}</span>
            <span className="text-xs text-muted-foreground">
              {client.emails[0]?.email ?? formatPhone(client.phones[0]?.phoneNumber)}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
