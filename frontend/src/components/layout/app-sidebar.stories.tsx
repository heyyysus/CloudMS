import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { MemoryRouter } from 'react-router'
import { AppSidebar } from './app-sidebar'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

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
      { id: 155, label: 'Jane Doe' },
      { id: 201, label: 'John Smith' },
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
