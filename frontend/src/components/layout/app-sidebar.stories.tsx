import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { MemoryRouter } from 'react-router'
import { AppSidebar } from './app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { Membership } from '@/api/auth'

const memberships: Membership[] = [
  { orgId: 'org-1', name: 'Acme Insurance', slug: 'acme', role: 'admin' },
  { orgId: 'org-2', name: 'Beacon Agency', slug: 'beacon', role: 'staff' },
]

const meta = {
  title: 'layout/AppSidebar',
  component: AppSidebar,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    // `route` lets a story start somewhere other than /home, which is what
    // decides whether the Admin group renders already expanded.
    (Story, { parameters }) => (
      <MemoryRouter initialEntries={[(parameters.route as string) ?? '/home']}>
        <TooltipProvider>
          <SidebarProvider>
            <Story />
            <SidebarInset>
              <div className="p-6 text-sm text-muted-foreground">Page content</div>
            </SidebarInset>
          </SidebarProvider>
        </TooltipProvider>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof AppSidebar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithOpenClients: Story = {
  args: {
    openTabs: [
      { id: '155', label: 'Jane Doe' },
      { id: '201', label: 'John Smith' },
    ],
    onCloseTab: fn(),
  },
}

// Staff see Home only - the Admin group and everything under it is hidden.
export const StaffHasNoAdminGroup: Story = {
  args: { isAdmin: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /admin/i })).not.toBeInTheDocument()
  },
}

export const AdminCollapsed: Story = {
  args: { isAdmin: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    // Away from /admin the group starts closed, so no child link is rendered.
    await expect(canvas.queryByRole('link', { name: 'Manage Users' })).not.toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /admin/i }))

    for (const title of ['Invite User', 'Manage Users', 'Manage Carriers', 'Trust Accounting']) {
      await expect(canvas.getByRole('link', { name: title })).toBeInTheDocument()
    }
  },
}

// A single membership links straight to /home - no dropdown to switch to.
export const SingleOrg: Story = {
  args: { orgName: 'Acme Insurance', memberships: [memberships[0]], activeOrgId: 'org-1' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('link', { name: /Acme Insurance/ })).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /Acme Insurance/ })).not.toBeInTheDocument()
  },
}

export const MultiOrg: Story = {
  args: {
    orgName: 'Acme Insurance',
    memberships,
    activeOrgId: 'org-1',
    onSelectOrg: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Acme Insurance/ }))

    // Radix portals dropdown content onto document.body, so query by role
    // there rather than canvas - and by menuitem role, since "Acme Insurance"
    // also appears as the (still-visible) trigger label.
    await expect(await screen.findByRole('menuitem', { name: 'Beacon Agency' })).toBeInTheDocument()
    await expect(screen.getByRole('menuitem', { name: 'Acme Insurance' })).toBeInTheDocument()

    // The active org is marked for both sighted and assistive-tech users, so
    // switching is not a guess. `data-active` drives the styling; the check
    // icon and aria-current are what actually surface it.
    const activeItem = screen.getByRole('menuitem', { name: 'Acme Insurance' })
    await expect(activeItem).toHaveAttribute('data-active', 'true')
    await expect(activeItem).toHaveAttribute('aria-current', 'true')
    await expect(activeItem.querySelector('svg')).toBeInTheDocument()

    const otherItem = screen.getByRole('menuitem', { name: 'Beacon Agency' })
    await expect(otherItem).toHaveAttribute('data-active', 'false')
    await expect(otherItem).not.toHaveAttribute('aria-current')
    await expect(otherItem.querySelector('svg')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('menuitem', { name: 'Beacon Agency' }))
    await expect(args.onSelectOrg).toHaveBeenCalledWith('org-2')
  },
}

// Landing on any /admin URL opens the group and marks the matching child.
export const AdminExpandedOnRoute: Story = {
  args: { isAdmin: true },
  parameters: { route: '/admin/carriers' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const active = canvas.getByRole('link', { name: 'Manage Carriers' })

    await expect(active).toBeInTheDocument()
    await expect(active).toHaveAttribute('data-active', 'true')
    // /admin itself is Invite User, so it must not also read as active here.
    await expect(canvas.getByRole('link', { name: 'Invite User' })).toHaveAttribute(
      'data-active',
      'false'
    )
  },
}
