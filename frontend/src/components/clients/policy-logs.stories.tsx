import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PolicyLogs } from './policy-logs'
import type { PolicyLog } from '@/api/policyLogs'

const logs: PolicyLog[] = [
  {
    id: 2,
    policyId: 900,
    logNumber: 2,
    body: 'Sent updated declarations page to the client.',
    createdAt: '2026-07-15T14:00:00.000Z',
    author: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
  },
  {
    id: 1,
    policyId: 900,
    logNumber: 1,
    body: 'Called the client to confirm garaging address.',
    createdAt: '2026-07-14T17:48:07.653Z',
    author: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
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
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
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
    await expect(await canvas.findByText(/sent updated declarations page/i)).toBeInTheDocument()
    const rows = canvas.getAllByText(/^#\d/)
    await expect(rows[0]).toHaveTextContent('#2')
    await expect(rows[1]).toHaveTextContent('#1')
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
