import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test'
import { AddLogDialog } from './add-log-dialog'
import { ApiError } from '@/api/client'
import { createPolicyLog, type PolicyLog } from '@/api/policyLogs'

const savedLog: PolicyLog = {
  id: 1,
  policyId: 900,
  logNumber: 1,
  body: 'Called the client back.',
  createdAt: '2026-07-14T17:48:07.653Z',
  author: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// AddLogDialog is fully controlled (opened by a shortcut or a button
// elsewhere in the tree), so the story owns the open state itself, same
// pattern as PolicyTabs' StatefulPolicyTabs wrapper. Radix portals the
// dialog content to document.body, outside canvasElement, so play functions
// below query via `screen`, not `within(canvasElement)`.
function StatefulAddLogDialog({
  policyId,
  createLogFn,
}: {
  policyId: number
  createLogFn?: typeof createPolicyLog
}) {
  const [open, setOpen] = useState(true)
  return (
    <AddLogDialog
      policyId={policyId}
      open={open}
      onOpenChange={setOpen}
      createLogFn={createLogFn}
    />
  )
}

const meta = {
  title: 'clients/AddLogDialog',
  component: StatefulAddLogDialog,
  tags: ['autodocs'],
  args: {
    policyId: 900,
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof StatefulAddLogDialog>

export default meta
type Story = StoryObj<typeof meta>

export const SubmitSavesAndCloses: Story = {
  args: {
    createLogFn: fn(async () => savedLog),
  },
  play: async ({ args }) => {
    await expect(await screen.findByRole('heading', { name: /add log/i })).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/what happened/i), 'Called the client back.')
    await userEvent.click(screen.getByRole('button', { name: /^add log$/i }))

    await expect(args.createLogFn).toHaveBeenCalledWith({
      policyId: 900,
      body: 'Called the client back.',
    })
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /add log/i })).not.toBeInTheDocument()
    )
  },
}

export const ValidationBlocksEmptySubmit: Story = {
  args: {
    createLogFn: fn(async () => savedLog),
  },
  play: async ({ args }) => {
    await screen.findByRole('heading', { name: /add log/i })

    await userEvent.click(screen.getByRole('button', { name: /^add log$/i }))

    await expect(await screen.findByText(/enter a note/i)).toBeInTheDocument()
    await expect(args.createLogFn).not.toHaveBeenCalled()
  },
}

export const ServerError: Story = {
  args: {
    createLogFn: fn(async () => {
      throw new ApiError(500, 'Something went wrong')
    }),
  },
  play: async () => {
    await screen.findByRole('heading', { name: /add log/i })

    await userEvent.type(screen.getByPlaceholderText(/what happened/i), 'A note.')
    await userEvent.click(screen.getByRole('button', { name: /^add log$/i }))

    await expect(await screen.findByText('Something went wrong')).toBeInTheDocument()
    await expect(screen.getByRole('heading', { name: /add log/i })).toBeInTheDocument()
  },
}
