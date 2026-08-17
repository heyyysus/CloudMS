import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState, type ComponentProps } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test'
import { InvoiceReceiptDialog } from './invoice-receipt-dialog'
import { ApiError } from '@/api/client'
import type { AutoPolicy, ClientDetail, Person } from '@/api/clients'
import type { Carrier } from '@/api/carriers'
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
  isActive: true,
  phone: null,
  email: null,
  website: null,
  producerCode: null,
  notes: null,
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

const closedInvoiceWithChange: InvoiceDetail = {
  ...closedInvoice,
  id: 43,
  payments: [
    {
      ...closedInvoice.payments[0],
      id: 6,
      invoiceId: 43,
      amount: '650.00',
      amountApplied: '600.00',
      changeGiven: '50.00',
    },
  ],
  receipts: [
    {
      ...closedInvoice.receipts[0],
      id: 89,
      paymentId: 6,
      invoiceId: 43,
      changeGiven: '50.00',
    },
  ],
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

const voidedInvoice: InvoiceDetail = {
  ...openInvoice,
  id: 44,
  status: 'void',
  voidedAt: TS,
  voidedBy: 1,
  voidReason: 'Duplicate invoice',
}

// Open but already carrying an active payment - the shape the backend refuses
// to void until that payment is voided first.
const paidOpenInvoice: InvoiceDetail = {
  ...closedInvoice,
  id: 45,
  status: 'open',
  amountPaid: '600.00',
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
    isAdmin: false,
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
    await expect(await screen.findByText('Doe, John')).toBeInTheDocument()
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
    // No change was given on this payment.
    await expect(screen.queryByText(/change given/i)).not.toBeInTheDocument()

    await expect(screen.getByText('Amount due')).toBeInTheDocument()
    await expect(screen.getByText('$0.00')).toBeInTheDocument()
    await expect(screen.getByText('New Auto Policy')).toBeInTheDocument()
    // Total and the credit-card payment both read $600.00.
    await expect(screen.getAllByText('$600.00').length).toBeGreaterThanOrEqual(1)

    await userEvent.click(screen.getByRole('button', { name: /print/i }))
    await expect(args.printFn).toHaveBeenCalled()
  },
}

export const ClosedInvoiceReceiptWithChange: Story = {
  args: {
    invoiceId: 43,
    getInvoiceFn: fn(async () => closedInvoiceWithChange),
  },
  play: async () => {
    await expect(await screen.findByText('Invoice #43')).toBeInTheDocument()
    await expect(screen.getByText(/change given: \$50\.00/i)).toBeInTheDocument()
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

export const AdminSeesVoidAction: Story = {
  args: {
    invoiceId: 42,
    isAdmin: true,
    getInvoiceFn: fn(async () => openInvoice),
  },
  play: async () => {
    await expect(await screen.findByText('Invoice #42')).toBeInTheDocument()
    await expect(screen.getByRole('button', { name: /void invoice/i })).toBeInTheDocument()
  },
}

export const NonAdminHasNoVoidAction: Story = {
  args: {
    // Invoice 41 carries an active payment, so this covers both void controls.
    invoiceId: 41,
    isAdmin: false,
    getInvoiceFn: fn(async () => closedInvoice),
  },
  play: async () => {
    await expect(await screen.findByText('Invoice #41')).toBeInTheDocument()
    // Print is still there - only the void actions are admin-gated.
    await expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
    await expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument()
    await expect(screen.queryByRole('button', { name: 'Void' })).not.toBeInTheDocument()
  },
}

export const VoidsASinglePayment: Story = {
  args: {
    invoiceId: 41,
    isAdmin: true,
    getInvoiceFn: fn(async () => closedInvoice),
    voidPaymentFn: fn(async () => closedInvoice.payments[0]),
    // Spied so the assertion below can prove the invoice was left alone.
    voidInvoiceFn: fn(async () => ({ ...voidedInvoice, id: 41 })),
  },
  play: async ({ args }) => {
    await expect(await screen.findByText('Invoice #41')).toBeInTheDocument()

    // The per-payment control lives on the payment row, named just "Void".
    await userEvent.click(screen.getByRole('button', { name: 'Void' }))
    await expect(await screen.findByText(/void payment #5\?/i)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/reason \(optional\)/i), 'keyed twice')
    await userEvent.click(screen.getByRole('button', { name: /void payment/i }))

    await waitFor(() =>
      expect(args.voidPaymentFn).toHaveBeenCalledWith(5, { reason: 'keyed twice' })
    )
    // The invoice itself is untouched by this action.
    await expect(args.voidInvoiceFn).not.toHaveBeenCalled()
    await expect(await screen.findByText(/payment voided/i)).toBeInTheDocument()
    await expect(screen.queryByText(/void payment #5\?/i)).not.toBeInTheDocument()
  },
}

export const CascadesPaymentsThenInvoice: Story = {
  args: {
    invoiceId: 41,
    isAdmin: true,
    getInvoiceFn: fn(async () => closedInvoice),
    voidPaymentFn: fn(async () => closedInvoice.payments[0]),
    voidInvoiceFn: fn(async () => ({ ...voidedInvoice, id: 41 })),
  },
  play: async ({ args }) => {
    await expect(await screen.findByText('Invoice #41')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /void invoice/i }))
    // The confirm step names the payments it will take with it, so the cascade
    // is never a surprise.
    await expect(await screen.findByText(/these go first/i)).toBeInTheDocument()
    await expect(screen.getByText(/Payment #5 — Credit card/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /void 1 payment\(s\) \+ invoice/i }))

    // Payment first, then the invoice - the server refuses the other order.
    await waitFor(() => expect(args.voidPaymentFn).toHaveBeenCalledWith(5, { reason: null }))
    await waitFor(() => expect(args.voidInvoiceFn).toHaveBeenCalledWith(41, { reason: null }))
    await expect(await screen.findByText('Void')).toBeInTheDocument()
    await expect(await screen.findByText(/invoice and 1 payment\(s\) voided/i)).toBeInTheDocument()
  },
}

export const CascadeReportsPartialProgress: Story = {
  args: {
    invoiceId: 41,
    isAdmin: true,
    getInvoiceFn: fn(async () => closedInvoice),
    voidPaymentFn: fn(async () => closedInvoice.payments[0]),
    voidInvoiceFn: fn(async () => {
      throw new ApiError(409, 'Invoice is already void')
    }),
  },
  play: async () => {
    await expect(await screen.findByText('Invoice #41')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /void invoice/i }))
    await userEvent.click(screen.getByRole('button', { name: /void 1 payment\(s\) \+ invoice/i }))

    // The payment void landed even though the invoice void didn't - saying so
    // is the whole point, otherwise the user can't tell what state they're in.
    const alert = await screen.findByRole('alert')
    await expect(alert).toHaveTextContent(/1 payment\(s\) were voided, but invoice is already void/i)
    // Confirm step stays open so they can see what happened.
    await expect(screen.getByText(/void invoice #41\?/i)).toBeInTheDocument()
  },
}

export const VoidedInvoiceHidesAction: Story = {
  args: {
    invoiceId: 44,
    isAdmin: true,
    getInvoiceFn: fn(async () => voidedInvoice),
  },
  play: async () => {
    await expect(await screen.findByText('Invoice #44')).toBeInTheDocument()
    // Status line plus the banner carrying the reason.
    await expect(screen.getByText('Void')).toBeInTheDocument()
    await expect(screen.getByText(/^Voided /)).toBeInTheDocument()
    await expect(screen.getByText('Duplicate invoice')).toBeInTheDocument()
    // Nothing left to void.
    await expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument()
  },
}

export const ConfirmsThenVoids: Story = {
  args: {
    invoiceId: 42,
    isAdmin: true,
    getInvoiceFn: fn(async () => openInvoice),
    voidInvoiceFn: fn(async () => ({ ...voidedInvoice, id: 42 })),
  },
  play: async ({ args }) => {
    await expect(await screen.findByText('Invoice #42')).toBeInTheDocument()
    await expect(screen.getByText('Open')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /void invoice/i }))
    await expect(await screen.findByText(/void invoice #42\?/i)).toBeInTheDocument()
    // No payments on this invoice, so there's no cascade notice and the submit
    // is the plain single-step label.
    await expect(screen.queryByText(/these go first/i)).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/reason \(optional\)/i), 'Duplicate invoice')
    // The trigger unmounts while confirming, so this resolves to the submit.
    await userEvent.click(screen.getByRole('button', { name: /void invoice/i }))

    await waitFor(() =>
      expect(args.voidInvoiceFn).toHaveBeenCalledWith(42, { reason: 'Duplicate invoice' })
    )
    // setQueryData flips the open dialog over to the voided detail.
    await expect(await screen.findByText('Void')).toBeInTheDocument()
    await expect(screen.getByText('Duplicate invoice')).toBeInTheDocument()
    await expect(await screen.findByText(/invoice voided/i)).toBeInTheDocument()
    // Confirm step closed, and there's no longer anything to void.
    await expect(screen.queryByText(/void invoice #42\?/i)).not.toBeInTheDocument()
    await expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument()
  },
}

export const PaymentVoidRefused: Story = {
  args: {
    invoiceId: 45,
    isAdmin: true,
    getInvoiceFn: fn(async () => paidOpenInvoice),
    voidPaymentFn: fn(async () => {
      throw new ApiError(409, 'Payment is already void')
    }),
  },
  play: async ({ args }) => {
    await expect(await screen.findByText('Invoice #45')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Void' }))
    // Submitted with no reason typed, so the body carries an explicit null.
    await userEvent.click(screen.getByRole('button', { name: /void payment/i }))
    await waitFor(() => expect(args.voidPaymentFn).toHaveBeenCalledWith(5, { reason: null }))

    // No payments were voided, so the message is the server's, unprefixed.
    const alert = await screen.findByRole('alert')
    await expect(alert).toHaveTextContent(/^Payment is already void$/i)
    // Nothing changed: still open, confirm step stays put.
    await expect(screen.getByText('Open')).toBeInTheDocument()
    await expect(screen.getByText(/void payment #5\?/i)).toBeInTheDocument()
  },
}
