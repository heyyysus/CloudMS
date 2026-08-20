import { ChevronRight, Cloud, House, Shield, UserRound, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import type { ClientTab } from '@/components/layout/client-tabs'

const platformItems = [{ title: 'Home', url: '/home', icon: House }]

// Admin's own url is the Invite User page, so it doubles as the first child.
// Everything under /admin is gated by RequireRole in App.tsx.
const adminItem = {
  title: 'Admin',
  url: '/admin',
  icon: Shield,
  children: [
    { title: 'Invite User', url: '/admin' },
    { title: 'Manage Users', url: '/admin/users' },
    { title: 'Manage Carriers', url: '/admin/carriers' },
    { title: 'Correspondence Templates', url: '/admin/correspondence' },
    { title: 'Reminders', url: '/admin/reminders' },
    { title: 'Trust Accounting', url: '/admin/trust-accounting' },
  ],
}

interface AppSidebarProps {
  openTabs?: ClientTab[]
  onCloseTab?: (id: number) => void
  isAdmin?: boolean
}

export function AppSidebar({ openTabs = [], onCloseTab, isAdmin = false }: AppSidebarProps) {
  const location = useLocation()
  const inAdmin = location.pathname.startsWith('/admin')

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/home">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Cloud className="size-4" />
                </div>
                <span className="text-sm font-semibold">CloudMS</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {platformItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={location.pathname === item.url}
                  >
                    <NavLink to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {isAdmin && (
                // The trigger only opens the group; each admin page is reached
                // through a child link, including Invite User at /admin itself.
                // In icon-rail mode SidebarMenuSub hides itself, so the parent
                // stays a plain icon with a tooltip.
                <Collapsible asChild defaultOpen={inAdmin} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={adminItem.title} isActive={inAdmin}>
                        <adminItem.icon />
                        <span>{adminItem.title}</span>
                        <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {adminItem.children.map((child) => (
                          <SidebarMenuSubItem key={child.url}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={location.pathname === child.url}
                            >
                              <NavLink to={child.url}>
                                <span>{child.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {openTabs.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Open Clients</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {openTabs.map((tab) => (
                  <SidebarMenuItem key={tab.id}>
                    <SidebarMenuButton
                      asChild
                      tooltip={tab.label}
                      isActive={location.pathname === `/clients/${tab.id}`}
                    >
                      <NavLink to={`/clients/${tab.id}`}>
                        <UserRound />
                        <span>{tab.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      aria-label={`Close ${tab.label}`}
                      onClick={(e) => {
                        e.preventDefault()
                        onCloseTab?.(tab.id)
                      }}
                    >
                      <X />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
