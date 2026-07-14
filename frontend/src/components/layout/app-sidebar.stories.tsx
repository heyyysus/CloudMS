import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
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
    (Story) => (
      <MemoryRouter initialEntries={['/home']}>
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
