import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { expect, fn, userEvent, within } from 'storybook/test'
import { UpcomingReminders } from './upcoming-reminders'
import type { ScheduledEmail } from '@/api/reminders'
import { ApiError } from '@/api/client'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const scheduled: ScheduledEmail[] = [
  {
    id: 42,
    status: 'pending',
    scheduledFor: '2099-01-31T15:00:00.000Z',
    sentAt: null,
    occurrenceDate: '2099-03-02',
    attempts: 0,
    lastError: null,
    subject: null,
    ruleName: '30-day renewal reminder',
    templateName: 'Renewal Notice',
    policyId: 7,
    policyNumber: 'POL-1001',
    clientId: 3,
    clientName: 'Jane Doe',
  },
  {
    id: 43,
    status: 'pending',
    scheduledFor: '2099-02-14T15:00:00.000Z',
    sentAt: null,
    occurrenceDate: '2099-03-16',
    attempts: 0,
    lastError: null,
    subject: null,
    ruleName: '7-day final notice',
    templateName: 'Documents Needed',
    policyId: 9,
    policyNumber: 'POL-1002',
    clientId: 4,
    clientName: 'John Smith',
  },
]

const meta = {
  title: 'admin/UpcomingReminders',
  component: UpcomingReminders,
  tags: ['autodocs'],
  args: {
    getScheduledEmailsFn: fn(async () => ({ scheduled })),
    cancelScheduledEmailFn: fn(async () => scheduled[0]),
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <QueryClientProvider client={createTestQueryClient()}>
          <Story />
        </QueryClientProvider>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof UpcomingReminders>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Jane Doe')).toBeInTheDocument()
    await expect(canvas.getByText(/POL-1001 · 30-day renewal reminder/)).toBeInTheDocument()
    // Only pending rows belong in a queue meant for stopping sends.
    await expect(args.getScheduledEmailsFn).toHaveBeenCalledWith(['pending'], expect.anything())
  },
}

export const Loading: Story = {
  args: { getScheduledEmailsFn: fn(() => new Promise(() => {})) },
}

export const Empty: Story = {
  args: { getScheduledEmailsFn: fn(async () => ({ scheduled: [] })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Nothing queued right now.')).toBeInTheDocument()
  },
}

export const LoadError: Story = {
  args: {
    getScheduledEmailsFn: fn(async () => {
      throw new ApiError(500, 'Internal server error')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Failed to load the queue.')).toBeInTheDocument()
  },
}

export const CancelsAQueuedReminder: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Jane Doe')

    await userEvent.click(canvas.getAllByRole('button', { name: 'Cancel' })[0])

    await expect(args.cancelScheduledEmailFn).toHaveBeenCalledWith(42)
  },
}
