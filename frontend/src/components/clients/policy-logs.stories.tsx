import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { PolicyLogs } from './policy-logs'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ApiError } from '@/api/client'
import type { PolicyLog } from '@/api/policyLogs'

const logs: PolicyLog[] = [
  {
    id: 2,
    policyId: 900,
    logNumber: 2,
    body: 'Insured called in to inquire about renewal offer and whether the multi-policy discount still applies to the new term.',
    createdAt: '2026-03-02T14:31:00',
    author: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
  },
  {
    id: 1,
    policyId: 900,
    logNumber: 1,
    body: 'Called the client to confirm garaging address.',
    createdAt: '2026-07-14T17:48:07',
    author: { id: 2, name: 'Tom Reyes', email: 'tom@example.com' },
  },
]

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/PolicyLogs',
  component: PolicyLogs,
  tags: ['autodocs'],
  args: {
    policyId: 900,
    onAddLog: fn(),
    currentUserId: 1,
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof PolicyLogs>

export default meta
type Story = StoryObj<typeof meta>

export const Loaded: Story = {
  args: {
    getPolicyLogsFn: fn(async () => logs),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Log #')).toBeInTheDocument()
    await expect(canvas.getByText('Date/Time')).toBeInTheDocument()
    await expect(canvas.getByText('User')).toBeInTheDocument()
    await expect(canvas.getByText('Content')).toBeInTheDocument()

    const rows = canvas.getAllByRole('button', { name: /^open log/i })
    await expect(rows).toHaveLength(2)
    await expect(rows[0]).toHaveAccessibleName('Open log 2')
    await expect(rows[1]).toHaveAccessibleName('Open log 1')
    await expect(rows[0]).toHaveTextContent('03/02/2026 - 02:31pm')
  },
}

export const Empty: Story = {
  args: {
    getPolicyLogsFn: fn(async () => []),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/no logs yet/i)).toBeInTheDocument()
  },
}

export const LoadError: Story = {
  args: {
    getPolicyLogsFn: fn(async () => {
      throw new ApiError(500, 'Something went wrong')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/failed to load logs/i)).toBeInTheDocument()
  },
}

export const AddLogButtonFires: Story = {
  args: {
    getPolicyLogsFn: fn(async () => []),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText(/no logs yet/i)
    await userEvent.click(canvas.getByRole('button', { name: /add log/i }))
    await expect(args.onAddLog).toHaveBeenCalled()
  },
}

export const CurrentUserChip: Story = {
  args: {
    getPolicyLogsFn: fn(async () => logs),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Log #')
    // log 2's author (id 1) is the current user; log 1's author (id 2) is not.
    const mine = canvas.getByText('JS')
    const theirs = canvas.getByText('TR')
    await expect(mine).toHaveClass('bg-primary')
    await expect(theirs).toHaveClass('bg-muted')
  },
}

export const TooltipShowsFullName: Story = {
  args: {
    getPolicyLogsFn: fn(async () => logs),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Log #')
    await userEvent.hover(canvas.getByText('TR'))
    await expect(await screen.findByRole('tooltip')).toHaveTextContent('Tom Reyes')
  },
}

export const OpensDetailDialog: Story = {
  args: {
    getPolicyLogsFn: fn(async () => logs),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const row = await canvas.findByRole('button', { name: 'Open log 2' })
    await userEvent.click(row)

    // Dialog content is portaled outside canvasElement, and its body repeats
    // the row's truncated text, so scope queries to the dialog itself.
    const dialog = within(await screen.findByRole('dialog'))
    await expect(dialog.getByText('Log #2')).toBeInTheDocument()
    await expect(dialog.getByText(/insured called in to inquire/i)).toBeInTheDocument()
    await expect(dialog.getByText('Jane Staff')).toBeInTheDocument()
    await expect(dialog.getByRole('button', { name: /copy log body/i })).toBeInTheDocument()
  },
}
