import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PolicyActivities } from './policy-activities'
import type { PolicyActivity } from '@/api/activities'
import { ApiError } from '@/api/client'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// Fixed relative to a far-future date so "in N days" copy stays stable no
// matter when the suite runs.
const pending: PolicyActivity = {
  id: 'scheduled-email:42',
  kind: 'reminder',
  title: '30-day renewal reminder',
  detail: 'Renewal Notice',
  scheduledFor: '2099-01-31T15:00:00.000Z',
  sentAt: null,
  status: 'pending',
  source: 'automation',
  cancellable: true,
  lastError: null,
}

const sent: PolicyActivity = {
  id: 'scheduled-email:41',
  kind: 'reminder',
  title: '60-day renewal reminder',
  detail: 'Your policy POL-1001 is renewing',
  scheduledFor: '2026-01-01T15:00:00.000Z',
  sentAt: '2026-01-01T15:00:04.000Z',
  status: 'sent',
  source: 'automation',
  cancellable: false,
  lastError: null,
}

const failed: PolicyActivity = {
  id: 'scheduled-email:40',
  kind: 'reminder',
  title: '90-day renewal reminder',
  detail: 'Renewal Notice',
  scheduledFor: '2026-01-01T15:00:00.000Z',
  sentAt: null,
  status: 'failed',
  source: 'automation',
  cancellable: false,
  lastError: 'Email delivery is unavailable',
}

const meta = {
  title: 'clients/PolicyActivities',
  component: PolicyActivities,
  tags: ['autodocs'],
  args: {
    policyId: 7,
    getPolicyActivitiesFn: fn(async () => ({ activities: [pending, sent] })),
    cancelScheduledEmailFn: fn(async () => ({}) as never),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof PolicyActivities>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('30-day renewal reminder')).toBeInTheDocument()
    await expect(canvas.getByText('Scheduled')).toBeInTheDocument()
    await expect(canvas.getByText('Sent')).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: {
    getPolicyActivitiesFn: fn(() => new Promise(() => {})),
  },
}

export const Empty: Story = {
  args: {
    getPolicyActivitiesFn: fn(async () => ({ activities: [] })),
  },
  // The empty state has to explain that reminders arrive on their own, or an
  // agent reads "nothing here" as a bug rather than a configuration state.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/added automatically from the rules/i)).toBeInTheDocument()
  },
}

export const LoadError: Story = {
  args: {
    getPolicyActivitiesFn: fn(async () => {
      throw new ApiError(500, 'Internal server error')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Failed to load activities.')).toBeInTheDocument()
  },
}

export const ShowsAFailure: Story = {
  args: {
    getPolicyActivitiesFn: fn(async () => ({ activities: [failed] })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Failed')).toBeInTheDocument()
    await expect(canvas.getByText('Email delivery is unavailable')).toBeInTheDocument()
  },
}

// Only a pending reminder can be stopped, and the numeric id has to be
// recovered from the namespaced one the API returns.
export const CancelsAPendingReminder: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('30-day renewal reminder')

    const cancelButtons = canvas.getAllByRole('button', { name: 'Cancel' })
    await expect(cancelButtons).toHaveLength(1)

    await userEvent.click(cancelButtons[0])

    // The mutationFn wraps this rather than being it, so react-query's
    // context object is not passed through - just the recovered numeric id.
    await expect(args.cancelScheduledEmailFn).toHaveBeenCalledWith(42)
  },
}
