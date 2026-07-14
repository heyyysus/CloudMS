import { Outlet } from 'react-router'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme-toggle'
import { AppSidebar } from './app-sidebar'
import { UserMenu } from './user-menu'
import { useAuth } from '@/auth/AuthContext'

export function AppLayout() {
  const { user } = useAuth()

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="h-4" />
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
    </TooltipProvider>
  )
}
