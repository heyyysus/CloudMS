import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, within } from 'storybook/test'
import { PolicyAttachments } from './policy-attachments'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PolicyAttachment } from '@/api/policyAttachments'

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
  },
}
