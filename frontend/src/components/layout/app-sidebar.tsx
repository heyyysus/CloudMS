import { Cloud, House, UserRound, X } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
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
  SidebarRail,
} from '@/components/ui/sidebar'
import type { ClientTab } from '@/components/layout/client-tabs'

const platformItems = [{ title: 'Home', url: '/home', icon: House }]

interface AppSidebarProps {
  openTabs?: ClientTab[]
  onCloseTab?: (id: number) => void
}

export function AppSidebar({ openTabs = [], onCloseTab }: AppSidebarProps) {
  const location = useLocation()

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
