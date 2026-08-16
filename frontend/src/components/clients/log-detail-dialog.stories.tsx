import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { LogDetailDialog } from './log-detail-dialog'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { PolicyAttachment } from '@/api/policyAttachments'
import type { PolicyLogAttachment } from '@/api/policyLogAttachments'
import type { PolicyLog } from '@/api/policyLogs'

const log: PolicyLog = {
  id: 2,
  policyId: 900,
  logNumber: 2,
  body: 'Insured called in to inquire about renewal offer.\n\nConfirmed the multi-policy discount still applies.',
  createdAt: '2026-03-02T14:31:00',
  author: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
}

const declarations: PolicyAttachment = {
  id: 10,
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

const links: PolicyLogAttachment[] = [
  {
    id: 501,
    logId: 2,
    createdAt: '2026-03-02T14:35:00',
    // Deliberately not the uploader, so the story proves the credit follows
    // the link rather than the file.
    linkedBy: { id: 2, name: 'Tom Reyes', email: 'tom@example.com' },
    attachment: declarations,
  },
  {
    id: 502,
    logId: 2,
    createdAt: '2026-03-02T14:36:00',
    linkedBy: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
    attachment: { ...declarations, id: 11, fileName: 'id-card.png', mimeType: 'image/png' },
  },
]

// LogDetailDialog is fully controlled by its `log` prop (opened by clicking a
// row in PolicyLogs), so the story owns the selection state itself, same
// pattern as AddLogDialog's StatefulAddLogDialog wrapper. Radix portals the
// dialog content to document.body, outside canvasElement, so play functions
// below query via `screen`, not `within(canvasElement)`.
function StatefulLogDetailDialog({
  currentUserId,
  onOpenChange,
  links,
  onPreviewAttachment,
  onUnlink,
  unlinkingId,
}: {
  currentUserId?: number
  onOpenChange: (open: boolean) => void
  links?: PolicyLogAttachment[]
  onPreviewAttachment?: (attachment: PolicyAttachment) => void
  onUnlink?: (linkId: number) => void
  unlinkingId?: number
}) {
  const [selected, setSelected] = useState<PolicyLog | null>(log)
  return (
    <LogDetailDialog
      log={selected}
      currentUserId={currentUserId}
      onOpenChange={(open) => {
        if (!open) setSelected(null)
        onOpenChange(open)
      }}
      links={links}
      onPreviewAttachment={onPreviewAttachment}
      onUnlink={onUnlink}
      unlinkingId={unlinkingId}
    />
  )
}

const meta = {
  title: 'clients/LogDetailDialog',
  component: StatefulLogDetailDialog,
  tags: ['autodocs'],
  args: {
    currentUserId: 1,
    onOpenChange: fn(),
    onPreviewAttachment: fn(),
    onUnlink: fn(),
  },
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
} satisfies Meta<typeof StatefulLogDetailDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async () => {
    await expect(await screen.findByText('Log #2')).toBeInTheDocument()
    await expect(screen.getByText('03/02/2026 - 02:31pm')).toBeInTheDocument()
    await expect(screen.getByText('Jane Staff')).toBeInTheDocument()
    await expect(
      screen.getByText(/insured called in to inquire about renewal offer/i)
    ).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /copy log body/i })).toBeInTheDocument()
  },
}

// No links is the common case; the section stays out of the way entirely.
export const WithoutAttachments: Story = {
  args: { links: [] },
  play: async () => {
    await screen.findByText('Log #2')
    await expect(screen.queryByText('Attachments')).not.toBeInTheDocument()
  },
}

export const WithLinkedAttachments: Story = {
  args: { links },
  play: async () => {
    await screen.findByText('Log #2')
    await expect(screen.getByText('Attachments')).toBeInTheDocument()
    // Extensions are stripped here too - the icon carries the type.
    await expect(screen.getByText('declarations-page')).toBeInTheDocument()
    await expect(screen.getByText('id-card')).toBeInTheDocument()
    // The credit is the linker, not the uploader.
    await expect(screen.getByText('Linked by Tom Reyes')).toBeInTheDocument()
    await expect(screen.getByText('Linked by Jane Staff')).toBeInTheDocument()
  },
}

export const PreviewsOnClick: Story = {
  args: { links },
  play: async ({ args }) => {
    await screen.findByText('Log #2')
    await userEvent.click(screen.getByRole('button', { name: 'Preview declarations-page' }))
    await expect(args.onPreviewAttachment).toHaveBeenCalledWith(declarations)
  },
}

export const UnlinksOnClick: Story = {
  args: { links },
  play: async ({ args }) => {
    await screen.findByText('Log #2')
    await userEvent.click(screen.getByRole('button', { name: 'Unlink id-card' }))
    await expect(args.onUnlink).toHaveBeenCalledWith(502)
  },
}

export const UnlinkInFlight: Story = {
  args: { links, unlinkingId: 501 },
  play: async () => {
    await screen.findByText('Log #2')
    await expect(screen.getByRole('button', { name: 'Unlink declarations-page' })).toBeDisabled()
    await expect(screen.getByRole('button', { name: 'Unlink id-card' })).toBeEnabled()
  },
}

export const ClosesOnEscape: Story = {
  play: async ({ args }) => {
    await screen.findByText('Log #2')
    await userEvent.keyboard('{Escape}')
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}
