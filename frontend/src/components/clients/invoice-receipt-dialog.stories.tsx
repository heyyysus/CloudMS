import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test'
import { InvoiceReceiptDialog } from './invoice-receipt-dialog'
import { ApiError } from '@/api/client'
import type { AutoPolicy, ClientDetail, Person } from '@/api/clients'
import type { Carrier } from '@/api/policies'
import type { InvoiceDetail } from '@/api/invoices'

const TS = '2026-07-14T17:48:07.653Z'

const namedInsured: Person = {
  id: 229,
  firstName: 'John',
  lastName: 'Doe',
  dateOfBirth: '1987-07-22',
  maritalStatus: 'married',
  gender: 'm',
  relationToInsured: 'self',
  createdAt: TS,
  updatedAt: TS,
}

const policy: AutoPolicy = {
  id: 900,
  clientId: 223,
  carrierId: 7,
  policyNumber: '2052',
  policyAddress1: null,
  policyAddress2: null,
  policyCity: null,
  policyState: null,
  policyZip: null,
  effectiveDate: '2026-01-01',
  expirationDate: '2027-01-01',
  status: 'active',
  createdAt: TS,
  updatedAt: TS,
}

const client: ClientDetail = {
  id: 223,
  namedInsuredId: 229,
  secondNamedInsuredId: null,
  mailingAddress1: null,
  mailingAddress2: null,
  mailingCity: null,
  mailingState: null,
  mailingZip: null,
  physicalAddress1: null,
  physicalAddress2: null,
  physicalCity: null,
  physicalState: null,
  physicalZip: null,
  createdAt: TS,
  updatedAt: TS,
  namedInsured,
  secondNamedInsured: null,
  phones: [],
  emails: [],
  policies: [policy],
}

const carrier: Carrier = {
  id: 7,
  name: 'Progressive',
  naic: '12345',
  createdAt: TS,
  updatedAt: TS,
}

const closedInvoice: InvoiceDetail = {
  id: 41,
  policyId: 900,
  clientId: 223,
  createdBy: 1,
  status: 'closed',
  total: '600.00',
  amountPaid: '600.00',
  note: 'New Auto Policy',
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  createdAt: TS,
  updatedAt: TS,
  items: [
    {
      id: 1,
      invoiceId: 41,
      category: 'sweep',
      type: 'new_business_sweep',
      carrierId: 7,
      description: null,
      amount: '400.00',
      createdAt: TS,
      carrier,
    },
    {
      id: 2,
      invoiceId: 41,
      category: 'agency',
      type: 'new_business_fee',
      carrierId: null,
      description: null,
      amount: '200.00',
      createdAt: TS,
      carrier: null,
    },
  ],
  payments: [
    {
      id: 5,
      invoiceId: 41,
      policyId: 900,
      clientId: 223,
      method: 'credit_card',
      amount: '600.00',
      amountApplied: '600.00',
      changeGiven: '0.00',
      note: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: TS,
    },
  ],
  receipts: [
    {
      id: 88,
      paymentId: 5,
      invoiceId: 41,
      policyId: 900,
      clientId: 223,
      amountApplied: '600.00',
      changeGiven: '0.00',
      amountDueAfter: '0.00',
      invoiceClosed: true,
      note: null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      createdAt: TS,
    },
  ],
  createdByUser: { id: 1, name: 'Jane Staff', email: 'jane@example.com' },
}

const openInvoice: InvoiceDetail = {
  ...closedInvoice,
  id: 42,
  status: 'open',
  amountPaid: '0.00',
  note: null,
  payments: [],
  receipts: [],
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// The dialog is controlled; wrap it so stories can open it and observe the
// receipt rendered in the Radix portal.
function StatefulInvoiceReceiptDialog(props: ComponentProps<typeof InvoiceReceiptDialog>) {
  const [open, setOpen] = useState(true)
  return <InvoiceReceiptDialog {...props} open={open} onOpenChange={setOpen} />
}

const meta = {
  title: 'clients/InvoiceReceiptDialog',
  component: StatefulInvoiceReceiptDialog,
  tags: ['autodocs'],
  args: {
    invoiceId: 41,
    client,
    policies: [policy],
    open: true,
    onOpenChange: fn(),
    printFn: fn(),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof StatefulInvoiceReceiptDialog>

export default meta
type Story = StoryObj<typeof meta>

export const ClosedInvoiceReceipt: Story = {
  args: {
    invoiceId: 41,
    getInvoiceFn: fn(async () => closedInvoice),
  },
  play: async ({ args }) => {
    // Radix portals dialog content onto document.body, so query via screen.
    await expect(await screen.findByText('John Doe')).toBeInTheDocument()
    await expect(screen.getByText('Client #223')).toBeInTheDocument()
    await expect(screen.getByText('Policy #2052')).toBeInTheDocument()
    await expect(screen.getByText('Invoice #41')).toBeInTheDocument()

    await expect(screen.getByText(/New business sweep/)).toBeInTheDocument()
    await expect(screen.getByText(/Progressive/)).toBeInTheDocument()
    await expect(screen.getByText('$400.00')).toBeInTheDocument()
    await expect(screen.getByText(/New business fee/)).toBeInTheDocument()
    await expect(screen.getByText('$200.00')).toBeInTheDocument()

    await expect(screen.getByText('Payments')).toBeInTheDocument()
    await expect(screen.getByText(/Credit card/)).toBeInTheDocument()
    await expect(screen.getByText(/Receipt #88/)).toBeInTheDocument()

    await expect(screen.getByText('Amount due')).toBeInTheDocument()
    await expect(screen.getByText('$0.00')).toBeInTheDocument()
    await expect(screen.getByText('New Auto Policy')).toBeInTheDocument()
    // Total and the credit-card payment both read $600.00.
    await expect(screen.getAllByText('$600.00').length).toBeGreaterThanOrEqual(1)

    await userEvent.click(screen.getByRole('button', { name: /print/i }))
    await expect(args.printFn).toHaveBeenCalled()
  },
}

export const OpenInvoiceReceipt: Story = {
  args: {
    invoiceId: 42,
    getInvoiceFn: fn(async () => openInvoice),
  },
  play: async () => {
    await expect(await screen.findByText('Invoice #42')).toBeInTheDocument()
    await expect(screen.getByText('Amount due')).toBeInTheDocument()
    // Total and amount due both read $600.00 (nothing paid yet).
    await expect(screen.getAllByText('$600.00')).toHaveLength(2)
    // No payments recorded yet, so the Payments section is absent.
    await expect(screen.queryByText('Payments')).not.toBeInTheDocument()
  },
}

export const LoadError: Story = {
  args: {
    invoiceId: 41,
    getInvoiceFn: fn(async () => {
      throw new ApiError(500, 'Something went wrong')
    }),
  },
  play: async () => {
    await waitFor(async () =>
      expect(await screen.findByText(/failed to load the invoice/i)).toBeInTheDocument()
    )
  },
}
