import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'
import {
  loadTabs,
  removeTabById,
  saveTabs,
  upsertTab,
  type ClientTab,
} from '@/lib/client-tabs-storage'

interface ClientTabsContextValue {
  tabs: ClientTab[]
  openTab: (tab: ClientTab) => void
  closeTab: (id: string) => void
  removeTab: (id: string) => void
  clearTabs: () => void
}

const ClientTabsContext = createContext<ClientTabsContextValue | null>(null)

export function ClientTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<ClientTab[]>(loadTabs)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    saveTabs(tabs)
  }, [tabs])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === null || e.key === 'cloudms.open-client-tabs') {
        setTabs(loadTabs())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  function openTab(tab: ClientTab) {
    setTabs((prev) => upsertTab(prev, tab))
  }

  function removeTab(id: string) {
    setTabs((prev) => removeTabById(prev, id))
  }

  // Used when the active org changes: the previous org's tabs point at
  // client ids that don't exist under the new org, so they can't just carry
  // over. The persistence effect above writes this through to localStorage
  // too, which is what keeps them from reappearing on reload.
  function clearTabs() {
    setTabs([])
  }

  function closeTab(id: string) {
    const wasActive = location.pathname === `/clients/${id}`
    const closedIndex = tabs.findIndex((t) => t.id === id)
    const next = removeTabById(tabs, id)
    setTabs(next)
    if (wasActive) {
      const neighbor = next[closedIndex] ?? next[closedIndex - 1]
      navigate(neighbor ? `/clients/${neighbor.id}` : '/home')
    }
  }

  return (
    <ClientTabsContext.Provider value={{ tabs, openTab, closeTab, removeTab, clearTabs }}>
      {children}
    </ClientTabsContext.Provider>
  )
}

export function useClientTabs(): ClientTabsContextValue {
  const ctx = useContext(ClientTabsContext)
  if (!ctx) throw new Error('useClientTabs must be used within a ClientTabsProvider')
  return ctx
}

export type { ClientTab }
