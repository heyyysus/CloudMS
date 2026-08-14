import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, userEvent, waitFor, within } from 'storybook/test'
import { ClientInvoices } from './client-invoices'
import { ApiError } from '@/api/client'
import type { Carrier } from '@/api/policies'
import type { Invoice } from '@/api/invoices'

const carrier: Carrier = {
  id: 7,
  name: 'Acme Insurance',
  naic: '12345',
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
}

const openInvoice: Invoice = {
  id: 10,
  policyId: 900,
  clientId: 155,
  createdBy: 1,
  status: 'open',
  total: '100.00',
  amountPaid: '40.00',
  note: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
  items: [
    {
      id: 2,
      invoiceId: 10,
      category: 'sweep',
      type: 'new_business_sweep',
      carrierId: 7,
      description: null,
      amount: '80.00',
      createdAt: '2026-07-14T17:48:07.653Z',
      carrier,
    },
    {
      id: 3,
      invoiceId: 10,
      category: 'agency',
      type: 'new_business_fee',
      carrierId: null,
      description: null,
      amount: '20.00',
      createdAt: '2026-07-14T17:48:07.653Z',
      carrier: null,
    },
  ],
}

const closedInvoice: Invoice = {
  ...openInvoice,
  id: 9,
  status: 'closed',
  total: '50.00',
  amountPaid: '50.00',
}

// Belongs to a different policy than openInvoice/closedInvoice, to exercise
// the policyId filter.
const otherPolicyInvoice: Invoice = {
  ...openInvoice,
  id: 11,
  policyId: 901,
  status: 'open',
  total: '75.00',
  amountPaid: '0.00',
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/ClientInvoices',
  component: ClientInvoices,
  tags: ['autodocs'],
  args: {
    clientId: 155,
    onPay: fn(),
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ClientInvoices>

export default meta
type Story = StoryObj<typeof meta>

export const ListsInvoicesWithDueAmount: Story = {
  args: {
    getInvoicesFn: fn(async () => [openInvoice, closedInvoice]),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Invoice #10')).toBeInTheDocument()
    await expect(canvas.getByText('$60.00 due')).toBeInTheDocument()
    await expect(canvas.getByText('Invoice #9')).toBeInTheDocument()
    await expect(canvas.queryByRole('button', { name: /pay/i })).toBeInTheDocument()

    // Clicking a row (here the closed invoice, which has no Pay button) opens
    // the receipt.
    await userEvent.click(canvas.getByText('Invoice #9'))
    await expect(args.onSelect).toHaveBeenCalledWith(9)

    // Paying stops propagation, so it fires onPay without also selecting.
    await userEvent.click(canvas.getByRole('button', { name: /pay/i }))
    await expect(args.onPay).toHaveBeenCalledWith(10)
    await expect(args.onSelect).toHaveBeenCalledTimes(1)
  },
}

export const Empty: Story = {
  args: {
    getInvoicesFn: fn(async () => []),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/no invoices/i)).toBeInTheDocument()
  },
}

export const LoadError: Story = {
  args: {
    getInvoicesFn: fn(async () => {
      throw new ApiError(500, 'Something went wrong')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(async () =>
      expect(await canvas.findByText(/failed to load invoices/i)).toBeInTheDocument()
    )
  },
}

export const FiltersByPolicy: Story = {
  args: {
    policyId: 900,
    getInvoicesFn: fn(async () => [openInvoice, closedInvoice, otherPolicyInvoice]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Invoice #10')).toBeInTheDocument()
    await expect(canvas.getByText('Invoice #9')).toBeInTheDocument()
    // Invoice #11 belongs to a different policy and is filtered out.
    await expect(canvas.queryByText('Invoice #11')).not.toBeInTheDocument()
  },
}

export const EmptyForPolicy: Story = {
  args: {
    policyId: 999,
    getInvoicesFn: fn(async () => [openInvoice, closedInvoice]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/no invoices for this policy/i)).toBeInTheDocument()
  },
}
