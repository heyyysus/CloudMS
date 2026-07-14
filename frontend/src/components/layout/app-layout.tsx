import { useState } from 'react'
import { useNavigate, Outlet } from 'react-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { AppSidebar } from './app-sidebar'
import { UserMenu } from './user-menu'
import { useAuth } from '@/auth/AuthContext'
import { ClientTabsProvider, useClientTabs } from './client-tabs'
import { useSearchShortcut } from '@/hooks/use-search-shortcut'
import { SearchPalette } from '@/components/search/search-palette'
import { SearchTriggerButton } from '@/components/search/search-trigger-button'
import { clientDisplayName } from '@/api/clients'
import type { SearchClientResult, SearchPolicyResult } from '@/api/search'

export function AppLayout() {
  return (
    <ClientTabsProvider>
      <AppLayoutInner />
    </ClientTabsProvider>
  )
}

function AppLayoutInner() {
  const { user } = useAuth()
  const { tabs, openTab, closeTab } = useClientTabs()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)

  useSearchShortcut(() => setSearchOpen((open) => !open))

  function handleSelectClient(client: SearchClientResult) {
    openTab({ id: client.id, label: clientDisplayName(client) })
    navigate(`/clients/${client.id}`)
  }

  function handleSelectPolicy(policy: SearchPolicyResult) {
    openTab({ id: policy.clientId, label: policy.clientName })
    navigate(`/clients/${policy.clientId}`)
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar openTabs={tabs} onCloseTab={closeTab} />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <SearchTriggerButton onClick={() => setSearchOpen(true)} />
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              {user && <UserMenu user={user} />}
            </div>
          </header>
          <main className="flex-1 p-6">
            <Outlet />
          </main>
        </SidebarInset>
      </SidebarProvider>
      <SearchPalette
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelectClient={handleSelectClient}
        onSelectPolicy={handleSelectPolicy}
      />
    </TooltipProvider>
  )
}
