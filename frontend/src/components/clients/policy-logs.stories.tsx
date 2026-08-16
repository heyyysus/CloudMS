import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { PolicyLogs } from './policy-logs'
import { ToastProvider } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ApiError } from '@/api/client'
import type { PolicyAttachment } from '@/api/policyAttachments'
import type { PolicyLogAttachment } from '@/api/policyLogAttachments'
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

const changeForm: PolicyAttachment = {
  id: 11,
  policyId: 900,
  fileName: 'Policy Change Form.pdf',
  description: 'Auto-generated summary of this edit',
  mimeType: 'application/pdf',
  sizeBytes: 42_000,
  isVoided: false,
  sourceType: 'policy_change',
  sourceId: 900,
  createdAt: '2026-03-02T14:31:00',
  uploadedBy: { id: 2, name: 'Tom Reyes', email: 'tom@example.com' },
}

// Linked to log 2 only, so the paperclip appears on one row and not the other.
const links: PolicyLogAttachment[] = [
  {
    id: 501,
    logId: 2,
    createdAt: '2026-03-02T14:32:00',
    linkedBy: { id: 2, name: 'Tom Reyes', email: 'tom@example.com' },
    attachment: changeForm,
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
    // Most stories are about the log list itself, so links default to empty
    // and the ones that care override it.
    getPolicyLogAttachmentsFn: fn(async () => []),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <TooltipProvider>
            <Story />
          </TooltipProvider>
        </ToastProvider>
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

export const BadgesLogsWithAttachments: Story = {
  args: {
    getPolicyLogsFn: fn(async () => logs),
    getPolicyLogAttachmentsFn: fn(async () => links),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Log #')
    const clips = await canvas.findAllByLabelText('Has attachments')
    await expect(clips).toHaveLength(1)
    // The clip sits on log 2, the only one with a link.
    await expect(canvas.getByRole('button', { name: 'Open log 2' })).toContainElement(clips[0])
  },
}

export const ShowsLinkedAttachmentsInDialog: Story = {
  args: {
    getPolicyLogsFn: fn(async () => logs),
    getPolicyLogAttachmentsFn: fn(async () => links),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Open log 2' }))

    const dialog = within(await screen.findByRole('dialog'))
    await expect(dialog.getByText('Attachments')).toBeInTheDocument()
    await expect(dialog.getByText('Policy Change Form')).toBeInTheDocument()
    await expect(dialog.getByText('Linked by Tom Reyes')).toBeInTheDocument()
    await expect(
      dialog.getByRole('button', { name: 'Unlink Policy Change Form' })
    ).toBeInTheDocument()
  },
}

export const UnlinksAnAttachment: Story = {
  args: {
    getPolicyLogsFn: fn(async () => logs),
    getPolicyLogAttachmentsFn: fn(async () => links),
    unlinkPolicyLogAttachmentFn: fn(async () => undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Open log 2' }))

    const dialog = within(await screen.findByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Unlink Policy Change Form' }))
    await expect(args.unlinkPolicyLogAttachmentFn).toHaveBeenCalledWith(501)
  },
}
