import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { PolicyAttachments } from './policy-attachments'
import { ToastProvider } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PolicyAttachment } from '@/api/policyAttachments'
import type { PolicyLog } from '@/api/policyLogs'

const uploaded: PolicyAttachment = {
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
  ...uploaded,
  id: 2,
  fileName: 'id-card.png',
  description: null,
  mimeType: 'image/png',
}

const receipt: PolicyAttachment = {
  ...uploaded,
  id: 3,
  fileName: 'Receipt #00001.pdf',
  description: 'Auto-generated receipt',
  sourceType: 'receipt',
  sourceId: 1,
}

// Only an admin ever receives a voided row; the server filters them out for
// staff.
const voidedReceipt: PolicyAttachment = {
  ...receipt,
  id: 4,
  fileName: 'Receipt #00002.pdf',
  isVoided: true,
  sourceId: 2,
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
  title: 'clients/PolicyAttachments',
  component: PolicyAttachments,
  tags: ['autodocs'],
  args: {
    policyId: 900,
    currentUserId: 1,
    onAddAttachment: fn(),
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
} satisfies Meta<typeof PolicyAttachments>

export default meta
type Story = StoryObj<typeof meta>

export const HidesFileExtensions: Story = {
  args: {
    getPolicyAttachmentsFn: fn(async () => [uploaded, idCard, receipt]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Names render without their extension - the icon carries the type.
    await expect(await canvas.findByText('declarations-page')).toBeInTheDocument()
    await expect(canvas.getByText('id-card')).toBeInTheDocument()
    await expect(canvas.getByText('Receipt #00001')).toBeInTheDocument()
    await expect(canvas.queryByText('declarations-page.pdf')).not.toBeInTheDocument()
    await expect(canvas.queryByText('Receipt #00001.pdf')).not.toBeInTheDocument()

    // The accessible name matches what's on screen.
    await expect(
      canvas.getByRole('button', { name: 'Preview declarations-page' })
    ).toBeInTheDocument()
  },
}

export const MarksVoidedDocuments: Story = {
  args: {
    getPolicyAttachmentsFn: fn(async () => [receipt, voidedReceipt]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Receipt #00002')).toBeInTheDocument()
    await expect(canvas.getByText('(Void)')).toBeInTheDocument()
    // The still-active receipt is not marked.
    await expect(canvas.getAllByText('(Void)')).toHaveLength(1)
  },
}

export const Empty: Story = {
  args: {
    getPolicyAttachmentsFn: fn(async () => []),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/no attachments yet/i)).toBeInTheDocument()
    // Nothing to select, so the mode can't be entered.
    await expect(canvas.getByRole('button', { name: 'Select' })).toBeDisabled()
  },
}

export const EntersSelectionMode: Story = {
  args: {
    getPolicyAttachmentsFn: fn(async () => [uploaded, idCard, receipt]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Select' }))

    await expect(canvas.getByText('0 selected')).toBeInTheDocument()
    // No attachments picked yet, so there is nothing to link.
    await expect(canvas.getByRole('button', { name: 'Link to log' })).toBeDisabled()
    // Rows swap from previewing to selecting.
    await expect(
      canvas.getByRole('button', { name: 'Select declarations-page' })
    ).toHaveAttribute('aria-pressed', 'false')
    await expect(
      canvas.queryByRole('button', { name: 'Preview declarations-page' })
    ).not.toBeInTheDocument()
  },
}

export const SelectsSeveralAttachments: Story = {
  args: {
    getPolicyAttachmentsFn: fn(async () => [uploaded, idCard, receipt]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Select' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select declarations-page' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select id-card' }))

    await expect(canvas.getByText('2 selected')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Link to log' })).toBeEnabled()

    // Clicking a selected row again removes it.
    await userEvent.click(canvas.getByRole('button', { name: 'Select id-card' }))
    await expect(canvas.getByText('1 selected')).toBeInTheDocument()
  },
}

export const CancelLeavesSelectionMode: Story = {
  args: {
    getPolicyAttachmentsFn: fn(async () => [uploaded, idCard]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Select' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select declarations-page' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }))

    await expect(canvas.getByRole('button', { name: 'Add attachment' })).toBeInTheDocument()
    await expect(
      canvas.getByRole('button', { name: 'Preview declarations-page' })
    ).toBeInTheDocument()
  },
}

export const LinksSelectionToALog: Story = {
  args: {
    getPolicyAttachmentsFn: fn(async () => [uploaded, idCard, receipt]),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Select' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select declarations-page' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Select id-card' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Link to log' }))

    // The dialog is portaled outside canvasElement.
    const dialog = within(await screen.findByRole('dialog'))
    await expect(dialog.getByText(/these 2 attachments/i)).toBeInTheDocument()
    // Nothing picked yet.
    await expect(dialog.getByRole('button', { name: 'Link' })).toBeDisabled()

    await userEvent.click(await dialog.findByRole('radio', { name: /renewal offer/i }))
    await userEvent.click(dialog.getByRole('button', { name: 'Link' }))

    await expect(args.linkAttachmentsToLogFn).toHaveBeenCalledWith({
      logId: 2,
      attachmentIds: [1, 2],
    })
  },
}
