import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { LinkAttachmentsToLogDialog } from './link-attachments-to-log-dialog'
import { ToastProvider } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ApiError } from '@/api/client'
import type { PolicyAttachment } from '@/api/policyAttachments'
import type { PolicyLog } from '@/api/policyLogs'

const declarations: PolicyAttachment = {
  id: 1,
  policyId: 900,
  fileName: 'declarations-page.pdf',
  description: 'Declarations page from carrier',
  mimeType: 'application/pdf',
  sizeBytes: 245_000,
  isVoided: false,
  sourceType: 'upload',
  sourceId: null,
  createdAt: '2026-03-02T14:31:00',
  uploadedBy: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
}

const idCard: PolicyAttachment = {
  ...declarations,
  id: 2,
  fileName: 'id-card.png',
  description: null,
  mimeType: 'image/png',
}

const logs: PolicyLog[] = [
  {
    id: 2,
    policyId: 900,
    logNumber: 2,
    body: 'Insured called in to inquire about the renewal offer.',
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
  title: 'clients/LinkAttachmentsToLogDialog',
  component: LinkAttachmentsToLogDialog,
  tags: ['autodocs'],
  args: {
    policyId: 900,
    currentUserId: 1,
    open: true,
    attachments: [declarations, idCard],
    onOpenChange: fn(),
    onLinked: fn(),
    getPolicyLogsFn: fn(async () => logs),
    linkAttachmentsToLogFn: fn(async () => []),
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
} satisfies Meta<typeof LinkAttachmentsToLogDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async () => {
    await expect(await screen.findByText('Link to log')).toBeInTheDocument()
    await expect(screen.getByText(/these 2 attachments/i)).toBeInTheDocument()
    // Every log on the policy is a candidate, whoever wrote it.
    await expect(await screen.findAllByRole('radio')).toHaveLength(2)
    await expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled()
  },
}

// A single file is named outright, which reads better than "these 1".
export const SingleAttachment: Story = {
  args: { attachments: [declarations] },
  play: async () => {
    await expect(await screen.findByText(/"declarations-page"/)).toBeInTheDocument()
  },
}

export const SelectsOneLogAtATime: Story = {
  play: async () => {
    const options = await screen.findAllByRole('radio')
    await userEvent.click(options[0])
    await expect(options[0]).toBeChecked()

    await userEvent.click(options[1])
    await expect(options[1]).toBeChecked()
    // Picking another replaces the first rather than adding to it.
    await expect(options[0]).not.toBeChecked()
  },
}

export const LinksTheSelection: Story = {
  play: async ({ args }) => {
    await userEvent.click((await screen.findAllByRole('radio'))[1])
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))

    await expect(args.linkAttachmentsToLogFn).toHaveBeenCalledWith({
      logId: 1,
      attachmentIds: [1, 2],
    })
    await expect(args.onLinked).toHaveBeenCalled()
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

export const NoLogsYet: Story = {
  args: { getPolicyLogsFn: fn(async () => []) },
  play: async () => {
    await expect(await screen.findByText(/no logs yet/i)).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled()
  },
}

export const LogsFailToLoad: Story = {
  args: {
    getPolicyLogsFn: fn(async () => {
      throw new ApiError(500, 'Something went wrong')
    }),
  },
  play: async () => {
    await expect(await screen.findByText(/failed to load logs/i)).toBeInTheDocument()
  },
}

export const LinkFails: Story = {
  args: {
    linkAttachmentsToLogFn: fn(async () => {
      throw new ApiError(400, 'Attachment and log belong to different policies')
    }),
  },
  play: async ({ args }) => {
    await userEvent.click((await screen.findAllByRole('radio'))[0])
    await userEvent.click(screen.getByRole('button', { name: 'Link' }))

    await expect(await screen.findByRole('alert')).toHaveTextContent(/different policies/i)
    // The dialog stays open so the user can retry or cancel.
    await expect(args.onLinked).not.toHaveBeenCalled()
  },
}
