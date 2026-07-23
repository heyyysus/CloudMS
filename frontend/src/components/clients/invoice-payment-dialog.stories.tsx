import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fireEvent, fn, screen, userEvent, waitFor } from 'storybook/test'
import { InvoicePaymentDialog } from './invoice-payment-dialog'
import { ApiError } from '@/api/client'
import type { ClientDetail } from '@/api/clients'
import type { Carrier } from '@/api/policies'
import type { Invoice } from '@/api/invoices'
import type { ReceiptDetail } from '@/api/payments'

const client: ClientDetail = {
  id: 155,
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
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
  namedInsured: {
    id: 229,
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1987-07-22',
    maritalStatus: 'married',
    gender: 'f',
    relationToInsured: 'self',
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
  secondNamedInsured: null,
  phones: [],
  emails: [],
  policies: [
    {
      id: 900,
      clientId: 155,
      carrierId: 7,
      policyNumber: 'POL-123',
      policyAddress1: null,
      policyAddress2: null,
      policyCity: null,
      policyState: null,
      policyZip: null,
      effectiveDate: '2026-07-14',
      expirationDate: '2027-01-14',
      status: 'active',
      createdAt: '2026-07-14T17:48:07.653Z',
      updatedAt: '2026-07-14T17:48:07.653Z',
    },
  ],
}

// The policy currently being viewed - passed in directly, never picked in
// the dialog itself.
const policy = { id: 900, policyNumber: 'POL-123' }

const carrier: Carrier = {
  id: 7,
  name: 'Acme Insurance',
  naic: '12345',
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
}

const createdInvoice: Invoice = {
  id: 42,
  policyId: 900,
  clientId: 155,
  createdBy: 1,
  status: 'open',
  total: '150.00',
  amountPaid: '0.00',
  note: null,
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
  items: [
    {
      id: 1,
      invoiceId: 42,
      category: 'agency',
      type: 'endorsement_fee',
      carrierId: null,
      description: null,
      amount: '150.00',
      createdAt: '2026-07-14T17:48:07.653Z',
      carrier: null,
    },
  ],
}

// Carries a carrier on its sweep item - server-defaulted, never picked - to
// verify the read-only "Pay" summary still shows it.
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

function receiptFor(overrides: Partial<ReceiptDetail> & { amountApplied: string; changeGiven: string }): ReceiptDetail {
  return {
    id: 500,
    paymentId: 900,
    invoiceId: 10,
    policyId: 900,
    clientId: 155,
    amountDueAfter: '0.00',
    invoiceClosed: true,
    note: null,
    createdAt: '2026-07-14T17:48:07.653Z',
    payment: {
      id: 900,
      invoiceId: 10,
      policyId: 900,
      clientId: 155,
      method: 'cash',
      amount: overrides.amountApplied,
      amountApplied: overrides.amountApplied,
      changeGiven: overrides.changeGiven,
      note: null,
      createdAt: '2026-07-14T17:48:07.653Z',
    },
    ...overrides,
  }
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// InvoicePaymentDialog is fully controlled (opened by a button elsewhere in
// the tree), so the story owns the open state itself, same pattern as
// AddLogDialog's StatefulAddLogDialog wrapper. Radix portals the dialog
// content to document.body, outside canvasElement, so play functions below
// query via `screen`, not `within(canvasElement)`.
function StatefulInvoicePaymentDialog(
  props: Omit<React.ComponentProps<typeof InvoicePaymentDialog>, 'open' | 'onOpenChange'>
) {
  const [open, setOpen] = useState(true)
  return <InvoicePaymentDialog {...props} open={open} onOpenChange={setOpen} />
}

const meta = {
  title: 'clients/InvoicePaymentDialog',
  component: StatefulInvoicePaymentDialog,
  tags: ['autodocs'],
  args: {
    client,
    policy,
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof StatefulInvoicePaymentDialog>

export default meta
type Story = StoryObj<typeof meta>

export const NoOpenInvoicesBuildsNewInvoice: Story = {
  args: {
    getInvoicesFn: fn(async () => []),
    createInvoiceFn: fn(async () => createdInvoice),
  },
  play: async ({ args }) => {
    await expect(await screen.findByRole('heading', { name: /create invoice/i })).toBeInTheDocument()
    // Policy is fixed text, not a picker.
    await expect(screen.getByText('POL-123')).toBeInTheDocument()
    await expect(
      screen.queryByRole('combobox', { name: /^policy$/i })
    ).not.toBeInTheDocument()
    // Invoice note is always visible, even before any payment rows exist.
    await expect(screen.getByLabelText(/^note \(optional\)$/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Line 1 type' }))
    await userEvent.click(await screen.findByRole('option', { name: /endorsement fee/i }))
    // The native Select's closing transition briefly sets pointer-events:
    // none on the body, so drive this field with fireEvent instead of
    // userEvent.type (see TermUpdatesExpiration in add-policy-form.stories.tsx).
    fireEvent.change(screen.getByLabelText('Line 1 amount'), { target: { value: '150' } })

    // findByRole (not getByRole): the Select's modal-close cleanup (aria-hidden
    // on the rest of the tree) can still be settling here.
    await userEvent.click(await screen.findByRole('button', { name: /create invoice/i }))

    await expect(args.createInvoiceFn).toHaveBeenCalledWith(
      expect.objectContaining({
        policyId: 900,
        items: [
          expect.objectContaining({
            category: 'agency',
            type: 'endorsement_fee',
            carrierId: null,
            amount: '150',
          }),
        ],
      })
    )

    await expect(await screen.findByRole('heading', { name: /invoice #42/i })).toBeInTheDocument()
    await expect(screen.getByText(/no payments recorded/i)).toBeInTheDocument()
    await expect(screen.getByText(/\$150\.00 due/)).toBeInTheDocument()
  },
}

export const OpenInvoiceChooseThenPay: Story = {
  args: {
    getInvoicesFn: fn(async () => [openInvoice]),
    recordPaymentFn: fn(async () => receiptFor({ amountApplied: '60.00', changeGiven: '0.00' })),
  },
  play: async ({ args }) => {
    await expect(
      await screen.findByRole('heading', { name: /new invoice or payment/i })
    ).toBeInTheDocument()

    await userEvent.click(await screen.findByRole('button', { name: /invoice #10/i }))
    await expect(await screen.findByRole('heading', { name: /pay invoice #10/i })).toBeInTheDocument()
    // Server-defaulted carrier still shows in the read-only summary.
    await expect(screen.getByText(/acme insurance/i)).toBeInTheDocument()
    await expect(screen.getByLabelText('Payment 1 amount')).toHaveValue('60.00')

    await userEvent.type(screen.getByLabelText('Payment 1 note'), 'Paid at front desk')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))

    await expect(args.recordPaymentFn).toHaveBeenCalledWith({
      invoiceId: 10,
      method: 'cash',
      amount: '60.00',
      note: 'Paid at front desk',
    })

    await expect(await screen.findByRole('heading', { name: /invoice #10/i })).toBeInTheDocument()
    await expect(screen.getByText(/closed/i)).toBeInTheDocument()
    await expect(screen.getByText(/\$60\.00 applied/)).toBeInTheDocument()
    await expect(screen.queryByText(/change given/i)).not.toBeInTheDocument()
  },
}

export const PreTargetedInvoiceSkipsChoiceAndShowsChange: Story = {
  args: {
    initialInvoiceId: 10,
    getInvoicesFn: fn(async () => [openInvoice]),
    recordPaymentFn: fn(async () => receiptFor({ amountApplied: '60.00', changeGiven: '40.00' })),
  },
  play: async () => {
    await expect(await screen.findByRole('heading', { name: /pay invoice #10/i })).toBeInTheDocument()
    await expect(
      screen.queryByRole('heading', { name: /new invoice or payment/i })
    ).not.toBeInTheDocument()

    const amountInput = screen.getByLabelText('Payment 1 amount')
    await userEvent.clear(amountInput)
    await userEvent.type(amountInput, '100')
    await userEvent.click(screen.getByRole('button', { name: /record payment/i }))

    await expect(await screen.findByText(/change given: \$40\.00/i)).toBeInTheDocument()
    await expect(screen.getByText(/total change to hand back/i)).toBeInTheDocument()
  },
}

export const ServerError: Story = {
  args: {
    getInvoicesFn: fn(async () => []),
    createInvoiceFn: fn(async () => {
      throw new ApiError(400, 'A sweep item needs a carrier')
    }),
  },
  play: async () => {
    await screen.findByRole('heading', { name: /create invoice/i })

    await userEvent.type(screen.getByLabelText('Line 1 amount'), '150')
    await userEvent.click(screen.getByRole('button', { name: /create invoice/i }))

    await expect(await screen.findByText('A sweep item needs a carrier')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /create invoice/i })).toBeInTheDocument()
    )
  },
}
