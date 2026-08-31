import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { SendCorrespondenceDialog } from './send-correspondence-dialog'
import { ToastProvider } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ApiError } from '@/api/client'
import type { ClientDetail } from '@/api/clients'
import type { PolicyDetail } from '@/api/policies'
import type { CorrespondenceTemplate } from '@/api/correspondenceTemplates'

const client = {
  id: 42,
  namedInsuredId: 1,
  secondNamedInsuredId: null,
  mailingAddress1: '123 Main St',
  mailingAddress2: null,
  mailingCity: 'Springfield',
  mailingState: 'CA',
  mailingZip: '90001',
  physicalAddress1: '123 Main St',
  physicalAddress2: null,
  physicalCity: 'Springfield',
  physicalState: 'CA',
  physicalZip: '90001',
  createdAt: '2026-01-01T00:00:00',
  updatedAt: '2026-01-01T00:00:00',
  namedInsured: {
    id: 1,
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1990-01-01',
    maritalStatus: null,
    gender: 'f',
    relationToInsured: 'self',
    createdAt: '2026-01-01T00:00:00',
    updatedAt: '2026-01-01T00:00:00',
  },
  secondNamedInsured: null,
  phones: [],
  emails: [
    { id: 1, clientId: 42, email: 'jane@example.com', createdAt: '2026-01-01T00:00:00' },
    { id: 2, clientId: 42, email: 'john@example.com', createdAt: '2026-01-01T00:00:00' },
  ],
  policies: [],
} as unknown as ClientDetail

const policy = { id: 900, policyNumber: 'POL-100482' } as unknown as PolicyDetail

const templates: CorrespondenceTemplate[] = [
  {
    id: 7,
    key: 'correspondence-renewal-notice-ab12cd34',
    name: 'Renewal Notice',
    subject: 'Policy {{policyNumber}} renews soon',
    body: 'Hi {{clientFullName}}, your {{carrierName}} policy renews soon.\n\n- {{agentName}}',
    updatedAt: '2026-02-01T00:00:00',
  },
  {
    id: 8,
    key: 'correspondence-document-request-ef56gh78',
    name: 'Document Request',
    subject: 'We need a document for {{policyNumber}}',
    body: 'Hi {{clientFirstName}}, please send us a copy of your license.',
    updatedAt: '2026-02-02T00:00:00',
  },
]

// The real, resolved values the server returns for this policy — the whole
// point of the preview is that it shows these rather than sample placeholders.
const mergeValues = {
  clientFirstName: 'Jane',
  clientLastName: 'Doe',
  clientFullName: 'Jane Doe',
  clientEmail: 'jane@example.com',
  clientPhone: '(555) 123-4567',
  clientAddress: '123 Main St',
  clientCity: 'Springfield',
  clientState: 'CA',
  clientZip: '90001',
  policyNumber: 'POL-100482',
  carrierName: 'Progressive',
  policyEffectiveDate: '2026-01-01',
  policyExpirationDate: '2027-01-01',
  policyStatus: 'active',
  agentName: 'Alex Agent',
  agentEmail: 'alex@example.com',
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

// Opens the dialog, which every story needs since the trigger lives inside the
// component rather than being driven by an `open` prop.
async function openDialog(canvasElement: HTMLElement) {
  await userEvent.click(within(canvasElement).getByRole('button', { name: /send/i }))
  return screen.findByRole('dialog')
}

async function chooseTemplate(name: string) {
  await userEvent.click(await screen.findByRole('combobox'))
  await userEvent.click(await screen.findByRole('option', { name }))
}

const meta = {
  title: 'clients/SendCorrespondenceDialog',
  component: SendCorrespondenceDialog,
  tags: ['autodocs'],
  args: {
    client,
    policy,
    isAdmin: false,
    getTemplatesFn: fn(async () => ({ templates, mergeFields: Object.keys(mergeValues) })),
    getMergeValuesFn: fn(async () => ({ values: mergeValues })),
    sendFn: fn(async () => ({
      id: 'msg_1',
      to: ['jane@example.com'],
      cc: [],
      subject: 'Policy POL-100482 renews soon',
    })),
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <QueryClientProvider client={createTestQueryClient()}>
          <ToastProvider>
            <TooltipProvider>
              <Story />
            </TooltipProvider>
          </ToastProvider>
        </QueryClientProvider>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof SendCorrespondenceDialog>

export default meta
type Story = StoryObj<typeof meta>

// To is prefilled with the client's first on-file address, so the common case
// is one click; the second address is still offered as an add chip.
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await expect(within(dialog).getByText('jane@example.com')).toBeInTheDocument()
    // The unused address is offered as an add chip under both To and Cc.
    await expect(within(dialog).getAllByRole('button', { name: 'john@example.com' })).toHaveLength(
      2
    )
    // Already in To, so it isn't offered again as an add chip anywhere.
    await expect(within(dialog).queryByRole('button', { name: 'jane@example.com' })).toBeNull()
  },
}

export const PreviewsRealClientAndPolicyData: Story = {
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await chooseTemplate('Renewal Notice')

    await expect(
      await within(dialog).findByText('Policy POL-100482 renews soon')
    ).toBeInTheDocument()
    await expect(
      within(dialog).getByText(/Hi Jane Doe, your Progressive policy renews soon\./)
    ).toBeInTheDocument()
    // No merge token survives into the preview.
    await expect(within(dialog).queryByText(/\{\{/)).toBeNull()
  },
}

// Template names carry no unique constraint, so two can share one. They must
// still be independently selectable: cmdk keys items by their value, and
// keying them by label instead collapsed same-named templates into a single
// hover/selection target.
export const DistinguishesSameNamedTemplates: Story = {
  args: {
    getTemplatesFn: fn(async () => ({
      templates: [templates[0], { ...templates[0], id: 9, name: 'Renewal Notice' }],
      mergeFields: Object.keys(mergeValues),
    })),
  },
  play: async ({ canvasElement, args }) => {
    const dialog = await openDialog(canvasElement)
    await userEvent.click(await within(dialog).findByRole('combobox'))

    const options = await screen.findAllByRole('option', { name: 'Renewal Notice' })
    await expect(options).toHaveLength(2)

    // Hovering one must highlight only that one. cmdk tracks the active item
    // by the value given to CommandItem, so a label-derived value made both
    // rows light up together.
    await userEvent.hover(options[0])
    await expect(options[0]).toHaveAttribute('data-selected', 'true')
    await expect(options[1]).not.toHaveAttribute('data-selected', 'true')

    // Picking the second one sends the second one, not the first.
    await userEvent.click(options[1])
    await userEvent.click(within(dialog).getByRole('button', { name: /^Send/ }))
    await expect(args.sendFn).toHaveBeenCalledWith(900, {
      templateId: 9,
      to: ['jane@example.com'],
      cc: [],
    })
  },
}

export const AddsAnOnFileAddressToCc: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await openDialog(canvasElement)
    // The second chip belongs to the Cc field; the first is To's.
    const chips = within(dialog).getAllByRole('button', { name: 'john@example.com' })
    await userEvent.click(chips[chips.length - 1])
    await chooseTemplate('Renewal Notice')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Send/ }))

    await expect(args.sendFn).toHaveBeenCalledWith(900, {
      templateId: 7,
      to: ['jane@example.com'],
      cc: ['john@example.com'],
    })
  },
}

// Off-file addresses are allowed here (unlike the older free-text send route),
// so a lienholder can be copied without first editing the client record.
export const AcceptsAFreeTextAddress: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await openDialog(canvasElement)
    const ccInput = within(dialog).getByLabelText('Add Cc address')
    await userEvent.type(ccInput, 'lienholder@bank.example.com')
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Add' })[1])
    await chooseTemplate('Renewal Notice')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Send/ }))

    await expect(args.sendFn).toHaveBeenCalledWith(900, {
      templateId: 7,
      to: ['jane@example.com'],
      cc: ['lienholder@bank.example.com'],
    })
  },
}

// The server rejects a to/cc overlap, so the form catches it first.
export const RejectsAnAddressInBothToAndCc: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await openDialog(canvasElement)
    const ccInput = within(dialog).getByLabelText('Add Cc address')
    await userEvent.type(ccInput, 'jane@example.com')
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Add' })[1])
    await chooseTemplate('Renewal Notice')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Send/ }))

    await expect(await within(dialog).findByText('Already in To')).toBeInTheDocument()
    await expect(args.sendFn).not.toHaveBeenCalled()
  },
}

export const RequiresATemplate: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await openDialog(canvasElement)
    await userEvent.click(within(dialog).getByRole('button', { name: /^Send/ }))

    await expect(await within(dialog).findByText('Choose a template')).toBeInTheDocument()
    await expect(args.sendFn).not.toHaveBeenCalled()
  },
}

export const RequiresARecipient: Story = {
  play: async ({ canvasElement, args }) => {
    const dialog = await openDialog(canvasElement)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove To recipient' }))
    await chooseTemplate('Renewal Notice')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Send/ }))

    await expect(await within(dialog).findByText('Add at least one recipient')).toBeInTheDocument()
    await expect(args.sendFn).not.toHaveBeenCalled()
  },
}

// A client with nothing on file still gets a usable dialog — the sender just
// has to type the address.
export const ClientWithNoEmailsOnFile: Story = {
  args: { client: { ...client, emails: [] } },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await expect(within(dialog).getByLabelText('Add To address')).toBeInTheDocument()
  },
}

export const NoTemplatesYet: Story = {
  args: { getTemplatesFn: fn(async () => ({ templates: [], mergeFields: [] })) },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await expect(
      await within(dialog).findByText(/no correspondence templates yet/i)
    ).toBeInTheDocument()
    // Staff can't author templates, so they get no link to the admin page.
    await expect(within(dialog).queryByRole('link', { name: /create one/i })).toBeNull()
  },
}

export const NoTemplatesYetAsAdmin: Story = {
  args: {
    isAdmin: true,
    getTemplatesFn: fn(async () => ({ templates: [], mergeFields: [] })),
  },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await expect(
      await within(dialog).findByRole('link', { name: /create one/i })
    ).toBeInTheDocument()
  },
}

export const SendFails: Story = {
  args: {
    sendFn: fn(async () => {
      throw new ApiError(503, 'Email sending is not configured')
    }),
  },
  play: async ({ canvasElement }) => {
    const dialog = await openDialog(canvasElement)
    await chooseTemplate('Renewal Notice')
    await userEvent.click(within(dialog).getByRole('button', { name: /^Send/ }))

    await expect(await screen.findByRole('alert')).toHaveTextContent(
      'Email sending is not configured'
    )
  },
}

// Demo deployments cannot send mail: the trigger is greyed out and the dialog
// never opens.
export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: /send/i })
    await expect(trigger).toBeDisabled()
    await expect(trigger).toHaveAttribute('title', 'Disabled in the demo')
    await expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  },
}
