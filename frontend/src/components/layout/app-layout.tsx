import { useState } from 'react'
import { useNavigate, Outlet } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { AppSidebar } from './app-sidebar'
import { UserMenu } from './user-menu'
import { useAuth } from '@/auth/AuthContext'
import { ClientTabsProvider, useClientTabs } from './client-tabs'
import { useSearchShortcut } from '@/hooks/use-search-shortcut'
import { useSubmitShortcut } from '@/hooks/use-submit-shortcut'
import { useDocumentTitle } from '@/hooks/use-document-title'
import { SearchPalette } from '@/components/search/search-palette'
import { SearchTriggerButton } from '@/components/search/search-trigger-button'
import { AddClientDialog } from '@/components/clients/add-client-dialog'
import { useToast } from '@/components/ui/toast'
import { clientDisplayName, type ClientDetail } from '@/api/clients'
import type { SearchClientResult, SearchPolicyResult } from '@/api/search'

export function AppLayout() {
  return (
    <ClientTabsProvider>
      <AppLayoutInner />
    </ClientTabsProvider>
  )
}

function AppLayoutInner() {
  const { user, org, memberships, role, setOrg } = useAuth()
  const { tabs, openTab, closeTab, clearTabs } = useClientTabs()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchOpen, setSearchOpen] = useState(false)

  useDocumentTitle(org ? `${org.name} · CloudMS` : 'CloudMS')
  useSearchShortcut(() => setSearchOpen((open) => !open))
  // Every form in the app renders under this layout, so registering here once
  // gives them all Cmd/Ctrl+Enter to submit.
  useSubmitShortcut()

  async function handleSelectOrg(orgId: string) {
    if (orgId === org?.id) return
    try {
      await setOrg(orgId)
      queryClient.clear()
      clearTabs()
      navigate('/home')
    } catch {
      toast.error("Couldn't switch organizations. Please try again.")
    }
  }

  function handleSelectClient(client: SearchClientResult) {
    openTab({ id: client.id, label: clientDisplayName(client) })
    navigate(`/clients/${client.id}`)
  }

  function handleSelectPolicy(policy: SearchPolicyResult) {
    openTab({ id: policy.clientId, label: policy.clientName })
    navigate(`/clients/${policy.clientId}`)
  }

  function handleClientCreated(client: ClientDetail) {
    openTab({ id: client.id, label: clientDisplayName(client) })
    navigate(`/clients/${client.id}`)
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          openTabs={tabs}
          onCloseTab={closeTab}
          isAdmin={role === 'admin'}
          orgName={org?.name ?? null}
          memberships={memberships}
          activeOrgId={org?.id ?? null}
          onSelectOrg={handleSelectOrg}
        />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
            <SearchTriggerButton onClick={() => setSearchOpen(true)} />
            <AddClientDialog onCreated={handleClientCreated} />
            <div className="ml-auto flex items-center gap-1">
              <ThemeToggle />
              {user && <UserMenu user={user} role={role} />}
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
