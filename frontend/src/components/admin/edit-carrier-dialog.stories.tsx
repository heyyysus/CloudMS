import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { EditCarrierDialog } from './edit-carrier-dialog'
import type { Carrier } from '@/api/carriers'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const carrier: Carrier = {
  id: 7,
  name: 'Acme Insurance',
  naic: '12345',
  isActive: true,
  phone: '555-0100',
  email: 'service@acme.example',
  website: 'https://acme.example',
  producerCode: 'PRD-42',
  notes: null,
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
}

const meta = {
  title: 'admin/EditCarrierDialog',
  component: EditCarrierDialog,
  tags: ['autodocs'],
  args: {
    carrier,
    onOpenChange: fn(),
    updateCarrierFn: fn(async () => ({ ...carrier, name: 'Acme Renamed' })),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof EditCarrierDialog>

export default meta
type Story = StoryObj<typeof meta>

export const SavesChanges: Story = {
  play: async ({ args }) => {
    const name = await screen.findByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Acme Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expect(args.updateCarrierFn).toHaveBeenCalledWith(7, {
      name: 'Acme Renamed',
      naic: '12345',
      producerCode: 'PRD-42',
      phone: '555-0100',
      email: 'service@acme.example',
      website: 'https://acme.example',
      notes: null,
      isActive: true,
    })
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

// Closed state: no carrier selected, so nothing renders.
export const Closed: Story = {
  args: { carrier: null },
  play: async () => {
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
