import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { ImportQuoteDialog } from './import-quote-dialog'
import type { ClientDetail, Person } from '@/api/clients'
import type { Carrier, PolicyDetail } from '@/api/policies'
import type { SearchResponse } from '@/api/search'
import fixtureRaw from '@/lib/__fixtures__/integration-file.tt2x?raw'

// A fully synthetic rater bridge file — see integration-file.tt2x for the
// commentary on which structural traps it deliberately exercises (a
// multi-word surname, a junk sibling zip, policy-level fee "coverages" with
// no limits, two vehicles at two different garaging locations, one matched
// and one unmatched driver).
const raterFile = new File([fixtureRaw], 'quote.tt2x', { type: 'application/octet-stream' })

const johnPerson: Person = {
  id: 501,
  firstName: 'JOHN',
  lastName: 'VAN DER BERG',
  dateOfBirth: '1985-03-12',
  maritalStatus: 'single',
  gender: 'm',
  relationToInsured: 'self',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

// Named insured intentionally matches the fixture's insured exactly, so the
// existing-client stories exercise the by-name driver-matching path.
const existingClient: ClientDetail = {
  id: 700,
  namedInsuredId: johnPerson.id,
  secondNamedInsuredId: null,
  mailingAddress1: '500 Fictional Ave',
  mailingAddress2: 'Apt 2',
  mailingCity: 'Rivertown',
  mailingState: 'TX',
  mailingZip: '75001',
  physicalAddress1: null,
  physicalAddress2: null,
  physicalCity: null,
  physicalState: null,
  physicalZip: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  namedInsured: johnPerson,
  secondNamedInsured: null,
  phones: [],
  emails: [],
  policies: [],
}

const alexPerson: Person = {
  id: 812,
  firstName: 'Alex',
  lastName: 'Rivera',
  dateOfBirth: '1990-01-01',
  maritalStatus: null,
  gender: 'other',
  relationToInsured: 'self',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const otherClient: ClientDetail = {
  id: 701,
  namedInsuredId: alexPerson.id,
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
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  namedInsured: alexPerson,
  secondNamedInsured: null,
  phones: [],
  emails: [],
  policies: [],
}

const createdClient: ClientDetail = { ...existingClient, id: 702 }

const carriers: Carrier[] = [
  {
    id: 9,
    name: 'Sample Mutual',
    naic: '00000',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
]

const createdPolicy: PolicyDetail = {
  id: 900,
  clientId: existingClient.id,
  carrierId: carriers[0].id,
  policyNumber: 'IMPORTED-1',
  policyAddress1: '500 Fictional Ave',
  policyAddress2: 'Apt 2',
  policyCity: 'Rivertown',
  policyState: 'TX',
  policyZip: '75001',
  effectiveDate: '2026-09-01',
  expirationDate: '2027-03-01',
  status: 'pending',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  client: {
    id: existingClient.id,
    namedInsuredId: existingClient.namedInsuredId,
    secondNamedInsuredId: null,
    mailingAddress1: existingClient.mailingAddress1,
    mailingAddress2: existingClient.mailingAddress2,
    mailingCity: existingClient.mailingCity,
    mailingState: existingClient.mailingState,
    mailingZip: existingClient.mailingZip,
    physicalAddress1: null,
    physicalAddress2: null,
    physicalCity: null,
    physicalState: null,
    physicalZip: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  carrier: carriers[0],
  vehicles: [],
  policyDrivers: [],
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

async function fillPolicyRequiredFields() {
  await userEvent.click(screen.getByRole('combobox', { name: /carrier/i }))
  await userEvent.click(await screen.findByRole('option', { name: /sample mutual/i }))
  await userEvent.type(screen.getByLabelText(/policy number/i), 'IMPORTED-1')
}

const meta = {
  title: 'clients/ImportQuoteDialog',
  component: ImportQuoteDialog,
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    file: raterFile,
    onImported: fn(),
    getCarriersFn: fn(async () => carriers),
    createPolicyFn: fn(async () => createdPolicy),
    createPolicyLogFn: fn(async () => ({
      id: 1,
      policyId: createdPolicy.id,
      logNumber: 1,
      body: 'imported',
      createdAt: '2026-08-01T00:00:00.000Z',
      author: { id: 1, name: 'Test User', email: 'test@example.com' },
    })),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ImportQuoteDialog>

export default meta
type Story = StoryObj<typeof meta>

// No `defaultClient` (as when dropped on Home) — defaults to the New client
// tab, prefilled from the parsed insured. Covers the multi-word-surname
// split, address/phone/email extraction, and the code maps (gender/marital
// status), then continues into the policy step and checks that both
// vehicles, their independently-resolved garaging zips, and the normalized
// BI/PD/COLL/COMP coverages all came through — which also proves the
// policy-level fee "coverages" in the fixture were correctly skipped (a
// leak would show up as a blank BI/PD instead of the real values).
export const ParsesAndPrefills: Story = {
  args: {
    createPersonFn: fn(async () => johnPerson),
    createClientFn: fn(async () => createdClient),
  },
  play: async () => {
    await expect(await screen.findByRole('tab', { name: /new client/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(screen.getByLabelText(/first name/i)).toHaveValue('JOHN')
    await expect(screen.getByLabelText(/last name/i)).toHaveValue('VAN DER BERG')
    await expect(screen.getByLabelText(/date of birth/i)).toHaveValue('1985-03-12')
    await expect(within(screen.getByLabelText(/^gender$/i)).getByText('Male')).toBeInTheDocument()
    await expect(
      within(screen.getByLabelText(/^marital status$/i)).getByText('single')
    ).toBeInTheDocument()
    const mailingFieldset = screen.getByText('Mailing Address').closest('fieldset')
    if (!mailingFieldset) throw new Error('Mailing Address fieldset not found')
    const mailingGroup = within(mailingFieldset)
    await expect(mailingGroup.getByLabelText(/address line 1/i)).toHaveValue('500 Fictional Ave')
    await expect(mailingGroup.getByLabelText(/^city$/i)).toHaveValue('Rivertown')
    await expect(mailingGroup.getByLabelText(/^zip$/i)).toHaveValue('75001')

    await userEvent.click(screen.getByRole('button', { name: /create client & continue/i }))

    await screen.findByLabelText(/policy number/i)
    const vins = screen.getAllByLabelText(/^vin$/i).map((el) => (el as HTMLInputElement).value)
    expect(vins).toEqual(
      expect.arrayContaining(['1HGCM82633A123456', '1FTFW1E51MFA00001'])
    )
    const zips = screen
      .getAllByLabelText(/garaging zip/i)
      .map((el) => (el as HTMLInputElement).value)
    expect(zips).toEqual(expect.arrayContaining(['75001', '75002']))
    await expect(within(screen.getByLabelText(/^bi$/i)).getByText('50/100')).toBeInTheDocument()
    await expect(within(screen.getByLabelText(/^pd$/i)).getByText('25')).toBeInTheDocument()
    const colls = screen
      .getAllByLabelText(/collision/i)
      .map((el) => el.textContent)
    expect(colls).toEqual(expect.arrayContaining([expect.stringContaining('500')]))

    // JOHN (the just-created insured) is auto-checked as an existing
    // driver; MARY (unmatched) landed as a new driver row.
    await expect(screen.getByRole('checkbox', { name: /john van der berg/i })).toBeChecked()
    await expect(screen.getByLabelText(/^first name$/i)).toHaveValue('MARY')
    await expect(screen.getByLabelText(/^last name$/i)).toHaveValue('VAN DER BERG')
  },
}

// A `defaultClient` (as when dropped on a client's own page) defaults to
// the Existing client tab, pre-selected — no search needed. The named
// insured on `existingClient` matches the fixture exactly, so JOHN should
// already be checked and MARY should land as a new driver without the user
// doing any matching by hand.
export const ExistingClientPath: Story = {
  args: {
    defaultClient: existingClient,
  },
  play: async ({ args }) => {
    await expect(await screen.findByRole('tab', { name: /existing client/i })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(screen.getByText('JOHN VAN DER BERG')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }))

    await screen.findByLabelText(/policy number/i)
    await expect(screen.getByRole('checkbox', { name: /john van der berg/i })).toBeChecked()
    await expect(screen.getByLabelText(/^first name$/i)).toHaveValue('MARY')

    await fillPolicyRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /import policy/i }))

    await waitFor(() =>
      expect(args.createPolicyFn).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: existingClient.id, policyNumber: 'IMPORTED-1' })
      )
    )
    await waitFor(() =>
      expect(args.createPolicyLogFn).toHaveBeenCalledWith(
        expect.objectContaining({ policyId: createdPolicy.id })
      )
    )
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
    await expect(args.onImported).toHaveBeenCalledWith(existingClient)
  },
}

// From the defaultClient confirmation, switching to a different client via
// search — the submitted policy body should carry the searched client's id,
// not the original defaultClient's.
export const SearchDifferentClientPath: Story = {
  args: {
    defaultClient: existingClient,
    searchFn: fn(async (): Promise<SearchResponse> => ({ clients: [otherClient], policies: [] })),
  },
  play: async ({ args }) => {
    await screen.findByText('JOHN VAN DER BERG')
    await userEvent.click(screen.getByRole('button', { name: /search a different client/i }))

    const input = await screen.findByPlaceholderText(/search clients/i)
    await userEvent.type(input, 'Rivera')
    await userEvent.click(await screen.findByText('Alex Rivera'))

    await screen.findByLabelText(/policy number/i)
    await fillPolicyRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /import policy/i }))

    await waitFor(() =>
      expect(args.createPolicyFn).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: otherClient.id })
      )
    )
  },
}

// Even with a defaultClient pre-selected, the user can switch to the New
// client tab instead — it should show the prefilled client form, not the
// defaultClient confirmation.
export const TogglesToNewClient: Story = {
  args: {
    defaultClient: existingClient,
    createPersonFn: fn(async () => johnPerson),
    createClientFn: fn(async () => createdClient),
  },
  play: async () => {
    await screen.findByText('JOHN VAN DER BERG')
    await userEvent.click(screen.getByRole('tab', { name: /new client/i }))
    await expect(await screen.findByLabelText(/first name/i)).toHaveValue('JOHN')
  },
}

// A file that doesn't contain the expected XML payload shows the parse
// error and lets the user back out.
export const ParseError: Story = {
  args: {
    file: new File(['not a rater file'], 'not-a-quote.txt'),
  },
  play: async ({ args }) => {
    await expect(await screen.findByText(/could not/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
    await expect(args.onOpenChange).toHaveBeenCalledWith(false)
  },
}

// A failed policy-log write must not fail the import itself — the log is
// best-effort.
export const LogFailureStillSucceeds: Story = {
  args: {
    defaultClient: existingClient,
    createPolicyLogFn: fn(async () => {
      throw new Error('log service unavailable')
    }),
  },
  play: async ({ args }) => {
    await screen.findByText('JOHN VAN DER BERG')
    await userEvent.click(screen.getByRole('button', { name: /^continue$/i }))
    await screen.findByLabelText(/policy number/i)

    await fillPolicyRequiredFields()
    await userEvent.click(screen.getByRole('button', { name: /import policy/i }))

    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false))
    await expect(args.onImported).toHaveBeenCalledWith(existingClient)
  },
}
