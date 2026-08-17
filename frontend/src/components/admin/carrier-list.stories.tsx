import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { ManageCarriersCard } from './carrier-list'
import type { Carrier } from '@/api/carriers'
import { ApiError } from '@/api/client'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const carriers: Carrier[] = [
  {
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
  },
  {
    id: 8,
    name: 'Old Mutual',
    naic: '67890',
    isActive: false,
    phone: null,
    email: null,
    website: null,
    producerCode: null,
    notes: 'Stopped writing new business in 2025.',
    createdAt: '2024-03-02T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
]

const meta = {
  title: 'admin/ManageCarriersCard',
  component: ManageCarriersCard,
  tags: ['autodocs'],
  args: {
    getCarriersFn: fn(async () => carriers),
    createCarrierFn: fn(async () => carriers[0]),
    updateCarrierFn: fn(async (id: number) => carriers.find((c) => c.id === id)!),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ManageCarriersCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Acme Insurance')).toBeInTheDocument()
    await expect(canvas.getByText(/NAIC 12345 · Producer PRD-42 · 555-0100/)).toBeInTheDocument()
    await expect(canvas.getByText('Inactive')).toBeInTheDocument()
  },
}

export const DeactivatesACarrier: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Acme Insurance')

    await userEvent.click(canvas.getByRole('button', { name: /actions for acme insurance/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate' }))

    await expect(args.updateCarrierFn).toHaveBeenCalledWith(7, { isActive: false })
  },
}

// An already-inactive carrier offers the reverse action.
export const ActivatesARetiredCarrier: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Old Mutual')

    await userEvent.click(canvas.getByRole('button', { name: /actions for old mutual/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Activate' }))

    await expect(args.updateCarrierFn).toHaveBeenCalledWith(8, { isActive: true })
  },
}

export const EditOpensTheDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Acme Insurance')

    await userEvent.click(canvas.getByRole('button', { name: /actions for acme insurance/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))

    await expect(await screen.findByRole('dialog')).toHaveTextContent('Edit carrier')
    await expect(screen.getByLabelText('Name')).toHaveValue('Acme Insurance')
  },
}

export const AddOpensTheDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Acme Insurance')

    await userEvent.click(canvas.getByRole('button', { name: /add carrier/i }))

    await expect(await screen.findByRole('dialog')).toHaveTextContent('Add carrier')
    await expect(screen.getByLabelText('Name')).toHaveValue('')
  },
}

export const Loading: Story = {
  args: { getCarriersFn: fn(() => new Promise<Carrier[]>(() => {})) },
}

export const LoadError: Story = {
  args: {
    getCarriersFn: fn(async () => {
      throw new ApiError(500, 'Server error')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/failed to load carriers/i)).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: { getCarriersFn: fn(async () => []) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No carriers yet.')).toBeInTheDocument()
  },
}
