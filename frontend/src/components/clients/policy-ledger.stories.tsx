import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PolicyLedger } from './policy-ledger'
import { ApiError } from '@/api/client'
import type { Carrier } from '@/api/carriers'
import type { Invoice } from '@/api/invoices'
import type { InvoicePayment } from '@/api/invoices'

const carrier: Carrier = {
  id: 7,
  name: 'Acme Insurance',
  naic: '12345',
  isActive: true,
  phone: null,
  email: null,
  website: null,
  producerCode: null,
  notes: null,
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
  createdAt: '2026-07-01T17:48:07.653Z',
  updatedAt: '2026-07-01T17:48:07.653Z',
  items: [
    {
      id: 2,
      invoiceId: 10,
      category: 'sweep',
      type: 'new_business_sweep',
      carrierId: 7,
      description: null,
      amount: '80.00',
      createdAt: '2026-07-01T17:48:07.653Z',
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
      createdAt: '2026-07-01T17:48:07.653Z',
      carrier: null,
    },
  ],
}

// Belongs to a different policy than openInvoice, to exercise the
// client-side policyId filter (invoices are fetched per-client, shared with
// every policy's Accounting subtab).
const otherPolicyInvoice: Invoice = {
  ...openInvoice,
  id: 11,
  policyId: 901,
  status: 'open',
  total: '75.00',
  amountPaid: '0.00',
}

const payment: InvoicePayment = {
  id: 5,
  invoiceId: 10,
  policyId: 900,
  clientId: 155,
  method: 'cash',
  amount: '40.00',
  amountApplied: '40.00',
  changeGiven: '0.00',
  note: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  createdAt: '2026-07-02T17:48:07.653Z',
}

const voidedPayment: InvoicePayment = {
  id: 6,
  invoiceId: 10,
  policyId: 900,
  clientId: 155,
  method: 'check',
  amount: '25.00',
  amountApplied: '25.00',
  changeGiven: '0.00',
  note: null,
  voidedAt: '2026-07-03T17:48:07.653Z',
  voidedBy: 2,
  voidReason: 'Deposited to the wrong invoice',
  createdAt: '2026-07-03T00:00:00.000Z',
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/PolicyLedger',
  component: PolicyLedger,
  tags: ['autodocs'],
  args: {
    clientId: 155,
    policyId: 900,
    onPay: fn(),
    onSelect: fn(),
    getInvoicesFn: fn(async () => [openInvoice]),
    getPaymentsFn: fn(async () => [payment]),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof PolicyLedger>

export default meta
type Story = StoryObj<typeof meta>

export const RunningBalance: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Invoice #10')).toBeInTheDocument()
    await expect(canvas.getByText('Payment #5')).toBeInTheDocument()

    // Charged 100, paid 40, so 60 due - shown in the header and as the final
    // running balance in the table.
    await expect(canvas.getByText('Balance due')).toBeInTheDocument()
    const balanceCells = canvas.getAllByText('$60.00')
    await expect(balanceCells.length).toBeGreaterThan(0)

    // Selecting the invoice row opens its receipt.
    await userEvent.click(canvas.getByText('Invoice #10'))
    await expect(args.onSelect).toHaveBeenCalledWith(10)

    // The invoice is still open, so it gets a Pay button.
    await userEvent.click(canvas.getByRole('button', { name: /pay/i }))
    await expect(args.onPay).toHaveBeenCalledWith(10)
  },
}

export const FiltersByPolicy: Story = {
  args: {
    getInvoicesFn: fn(async () => [openInvoice, otherPolicyInvoice]),
    getPaymentsFn: fn(async () => [payment]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Invoice #10')).toBeInTheDocument()
    // Invoice #11 belongs to a different policy and is filtered out.
    await expect(canvas.queryByText('Invoice #11')).not.toBeInTheDocument()
  },
}

export const VoidedPayment: Story = {
  args: {
    getInvoicesFn: fn(async () => [openInvoice]),
    getPaymentsFn: fn(async () => [payment, voidedPayment]),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The voided payment produces two rows sharing the same reference: the
    // original (zeroed out) and the `*_void` correction.
    await expect(await canvas.findAllByText('Payment #6')).toHaveLength(2)
    await expect(canvas.getByText('Payment void')).toBeInTheDocument()
    await expect(canvas.getByText('Deposited to the wrong invoice')).toBeInTheDocument()
    // The void withdraws the credit, so the balance is still 60 due (the
    // voided payment never counted).
    await expect(canvas.getByText('Balance due')).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: {
    getInvoicesFn: fn(() => new Promise(() => {})),
    getPaymentsFn: fn(() => new Promise(() => {})),
  },
}

export const Empty: Story = {
  args: {
    getInvoicesFn: fn(async () => []),
    getPaymentsFn: fn(async () => []),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/no accounting activity/i)).toBeInTheDocument()
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
    await expect(await canvas.findByText(/failed to load accounting activity/i)).toBeInTheDocument()
  },
}
