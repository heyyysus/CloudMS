import { Check, ChevronsUpDown, Cloud } from 'lucide-react'
import { NavLink } from 'react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import type { Membership } from '@/api/auth'

interface OrgSwitcherProps {
  orgName: string | null
  memberships: Membership[]
  activeOrgId: string | null
  onSelectOrg: (orgId: string) => void
}

// With one membership this is a static label - there's nothing to switch to.
// More than one turns the same button into a DropdownMenu trigger, following
// the pattern in user-menu.tsx.
export function OrgSwitcher({ orgName, memberships, activeOrgId, onSelectOrg }: OrgSwitcherProps) {
  const label = orgName ?? 'CloudMS'
  const icon = (
    <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
      <Cloud className="size-4" />
    </div>
  )

  if (memberships.length <= 1) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" asChild>
            <NavLink to="/home">
              {icon}
              <span className="text-sm font-semibold">{label}</span>
            </NavLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg">
              {icon}
              <span className="text-sm font-semibold">{label}</span>
              <ChevronsUpDown className="ml-auto text-muted-foreground" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {memberships.map((membership) => {
              const active = membership.orgId === activeOrgId
              return (
                <DropdownMenuItem
                  key={membership.orgId}
                  onSelect={() => onSelectOrg(membership.orgId)}
                  data-active={active}
                  aria-current={active ? 'true' : undefined}
                  className="data-[active=true]:font-medium"
                >
                  {membership.name}
                  {active ? <Check className="ml-auto size-4" /> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
