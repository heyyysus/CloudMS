import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen } from 'storybook/test'
import { AttachmentPreviewDialog } from './attachment-preview-dialog'
import type { PolicyAttachment } from '@/api/policyAttachments'

const pdfAttachment: PolicyAttachment = {
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

const imageAttachment: PolicyAttachment = {
  ...pdfAttachment,
  id: 2,
  fileName: 'id-card.png',
  description: null,
  mimeType: 'image/png',
}

const textAttachment: PolicyAttachment = {
  ...pdfAttachment,
  id: 3,
  fileName: 'notes.txt',
  description: null,
  mimeType: 'text/plain',
}

// AttachmentPreviewDialog is fully controlled by its `attachment` prop
// (opened by clicking a row in PolicyAttachments), so each story just passes
// the attachment directly - no stateful wrapper needed since none of these
// stories exercise closing the dialog. It also fetches via useQuery, so it
// needs a QueryClientProvider.
function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/AttachmentPreviewDialog',
  component: AttachmentPreviewDialog,
  tags: ['autodocs'],
  args: {
    onOpenChange: fn(),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AttachmentPreviewDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Pdf: Story = {
  args: {
    attachment: pdfAttachment,
    getPolicyAttachmentLinkFn: fn(async () => ({ url: 'https://example.com/declarations.pdf' })),
  },
  play: async () => {
    // The extension is stripped everywhere it's shown; only the download
    // filename keeps it.
    await expect(await screen.findByText('declarations-page')).toBeInTheDocument()
    await expect(screen.getByTitle('declarations-page')).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /open in new tab/i })).toBeInTheDocument()
  },
}

export const Image: Story = {
  args: {
    attachment: imageAttachment,
    getPolicyAttachmentLinkFn: fn(async () => ({ url: 'https://example.com/id-card.png' })),
  },
  play: async () => {
    await expect(await screen.findByAltText('id-card')).toBeInTheDocument()
  },
}

export const UnsupportedType: Story = {
  args: {
    attachment: textAttachment,
    getPolicyAttachmentLinkFn: fn(async () => ({ url: 'https://example.com/notes.txt' })),
  },
  play: async () => {
    await expect(await screen.findByText(/can't be previewed/i)).toBeInTheDocument()
  },
}

export const LoadError: Story = {
  args: {
    attachment: pdfAttachment,
    getPolicyAttachmentLinkFn: fn(async () => {
      throw new Error('network error')
    }),
  },
  play: async () => {
    await expect(await screen.findByText(/failed to load preview/i)).toBeInTheDocument()
  },
}
