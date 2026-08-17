import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { AddCarrierDialog } from './add-carrier-dialog'
import type { Carrier } from '@/api/carriers'
import { ApiError } from '@/api/client'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const created: Carrier = {
  id: 9,
  name: 'New Mutual',
  naic: '99887',
  isActive: true,
  phone: null,
  email: null,
  website: null,
  producerCode: null,
  notes: null,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
}

const meta = {
  title: 'admin/AddCarrierDialog',
  component: AddCarrierDialog,
  tags: ['autodocs'],
  args: { createCarrierFn: fn(async () => created) },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AddCarrierDialog>

export default meta
type Story = StoryObj<typeof meta>

async function openAndFill(canvasElement: HTMLElement) {
  const canvas = within(canvasElement)
  await userEvent.click(canvas.getByRole('button', { name: /add carrier/i }))

  await userEvent.type(await screen.findByLabelText('Name'), 'New Mutual')
  await userEvent.type(screen.getByLabelText('NAIC'), '99887')
  await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', {
    name: 'Add carrier',
  }))
}

export const CreatesACarrier: Story = {
  play: async ({ canvasElement, args }) => {
    await openAndFill(canvasElement)

    // Passed straight to useMutation as mutationFn, so react-query supplies a
    // context object as the second argument.
    await expect(args.createCarrierFn).toHaveBeenCalledWith(
      {
        name: 'New Mutual',
        naic: '99887',
        producerCode: null,
        phone: null,
        email: null,
        website: null,
        notes: null,
        isActive: true,
      },
      expect.anything()
    )
    // Closes on success. Radix leaves the node mounted through its exit
    // transition, so the state attribute is the reliable signal here.
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toHaveAttribute('data-state', 'closed')
    )
  },
}

// A duplicate NAIC comes back as a 409 with the server's message; the dialog
// stays open so the admin can correct it without retyping everything.
export const KeepsTheDraftOnAConflict: Story = {
  args: {
    createCarrierFn: fn(async () => {
      throw new ApiError(409, 'A carrier with this NAIC already exists')
    }),
  },
  play: async ({ canvasElement }) => {
    await openAndFill(canvasElement)

    await expect(await screen.findByRole('alert')).toHaveTextContent(/NAIC already exists/i)
    await expect(screen.getByLabelText('Name')).toHaveValue('New Mutual')
  },
}
