import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { LogDetailDialog } from './log-detail-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PolicyLog } from '@/api/policyLogs'

const log: PolicyLog = {
  id: 2,
  policyId: 900,
  logNumber: 2,
  body: 'Insured called in to inquire about renewal offer.\n\nConfirmed the multi-policy discount still applies.',
  createdAt: '2026-03-02T14:31:00',
  author: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
}

// LogDetailDialog is fully controlled by its `log` prop (opened by clicking a
// row in PolicyLogs), so the story owns the selection state itself, same
// pattern as AddLogDialog's StatefulAddLogDialog wrapper. Radix portals the
// dialog content to document.body, outside canvasElement, so play functions
// below query via `screen`, not `within(canvasElement)`.
function StatefulLogDetailDialog({
  currentUserId,
  onOpenChange,
}: {
  currentUserId?: number
  onOpenChange: (open: boolean) => void
}) {
  const [selected, setSelected] = useState<PolicyLog | null>(log)
  return (
    <LogDetailDialog
      log={selected}
      currentUserId={currentUserId}
      onOpenChange={(open) => {
        if (!open) setSelected(null)
        onOpenChange(open)
      }}
    />
  )
}

const meta = {
  title: 'clients/LogDetailDialog',
  component: StatefulLogDetailDialog,
  tags: ['autodocs'],
  args: {
    currentUserId: 1,
    onOpenChange: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof StatefulLogDetailDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async () => {
    await expect(await screen.findByText('Log #2')).toBeInTheDocument()
    await expect(screen.getByText('03/02/2026 - 02:31pm')).toBeInTheDocument()
    await expect(screen.getByText('Jane Staff')).toBeInTheDocument()
    await expect(
      screen.getByText(/insured called in to inquire about renewal offer/i)
    ).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /copy log body/i })).toBeInTheDocument()
  },
}

export const ClosesOnEscape: Story = {
  play: async ({ args }) => {
    await screen.findByText('Log #2')
    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}
