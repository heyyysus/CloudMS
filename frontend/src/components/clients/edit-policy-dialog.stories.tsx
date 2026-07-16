import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { EditPolicyDialog } from './edit-policy-dialog'
import { ApiError } from '@/api/client'
import type { ClientDetail } from '@/api/clients'
import type { Carrier, PolicyDetail } from '@/api/policies'

const client: ClientDetail = {
  id: 155,
  namedInsuredId: 229,
  secondNamedInsuredId: null,
  mailingAddress1: '42 Wallaby Way, Sydney',
  mailingAddress2: null,
  mailingCity: null,
  mailingState: null,
  mailingZip: null,
  physicalAddress1: '1 Ocean Ave, Sydney',
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
  policies: [],
}

const carriers: Carrier[] = [
  {
    id: 7,
    name: 'Acme Insurance',
    naic: '12345',
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
]

const policy: PolicyDetail = {
  id: 900,
  clientId: 155,
  carrierId: 7,
  policyNumber: 'POL-123',
  policyAddress1: '1 Ocean Ave, Sydney',
  policyAddress2: null,
  policyCity: null,
  policyState: null,
  policyZip: null,
  effectiveDate: '2026-01-14',
  expirationDate: '2026-07-14',
  status: 'active',
  createdAt: '2026-01-14T17:48:07.653Z',
  updatedAt: '2026-01-14T17:48:07.653Z',
  client: {
    id: 155,
    namedInsuredId: 229,
    secondNamedInsuredId: null,
    mailingAddress1: '42 Wallaby Way, Sydney',
    mailingAddress2: null,
    mailingCity: null,
    mailingState: null,
    mailingZip: null,
    physicalAddress1: '1 Ocean Ave, Sydney',
    physicalAddress2: null,
    physicalCity: null,
    physicalState: null,
    physicalZip: null,
    createdAt: '2026-01-14T17:48:07.653Z',
    updatedAt: '2026-01-14T17:48:07.653Z',
  },
  carrier: carriers[0],
  vehicles: [
    {
      id: 40,
      policyId: 900,
      vin: '1HGCM82633A004352',
      make: 'Honda',
      model: 'Accord',
      year: 2019,
      garagingZip: '90001',
      coverageBi: '100/300',
      coveragePd: '50000',
      coverageUmbi: null,
      coverageUmpd: null,
      coverageCdw: null,
      coverageMedpay: null,
      coverageColl: '500 ded',
      coverageComp: '500 ded',
      coverageRentalReimbursement: null,
      coverageTowing: null,
      createdAt: '2026-01-14T17:48:07.653Z',
      updatedAt: '2026-01-14T17:48:07.653Z',
    },
  ],
  policyDrivers: [
    {
      id: 60,
      policyId: 900,
      driverId: 61,
      createdAt: '2026-01-14T17:48:07.653Z',
      driver: {
        id: 61,
        personId: 229,
        dlNumber: 'D1234567',
        rating: 'rated',
        sr22: false,
        person: client.namedInsured,
      },
    },
  ],
}

const savedPolicy: PolicyDetail = { ...policy, policyNumber: 'POL-456' }

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/EditPolicyDialog',
  component: EditPolicyDialog,
  tags: ['autodocs'],
  args: {
    client,
    policy,
    existingVehicles: [],
    existingDrivers: [{ personId: 229, person: client.namedInsured, driver: policy.policyDrivers[0].driver }],
    getCarriersFn: fn(async () => carriers),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof EditPolicyDialog>

export default meta
type Story = StoryObj<typeof meta>

export const OpensAndPrefills: Story = {
  args: {
    updatePolicyFn: fn(async () => savedPolicy),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^edit$/i }))
    await expect(await screen.findByRole('heading', { name: /edit policy/i })).toBeInTheDocument()

    await expect(screen.getByLabelText(/policy number/i)).toHaveValue('POL-123')
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /carrier/i })).toHaveTextContent(
        /acme insurance/i
      )
    )
    await expect(screen.getByLabelText(/^vin$/i)).toHaveValue(policy.vehicles[0].vin)
    await expect(screen.getByRole('checkbox', { name: /jane doe/i })).toBeChecked()

    const termTrigger = screen.getByRole('combobox', { name: /term/i })
    await expect(termTrigger).toHaveTextContent(/6 months/i)
  },
}

export const SubmitSavesAndCloses: Story = {
  args: {
    updatePolicyFn: fn(async () => savedPolicy),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^edit$/i }))
    await screen.findByLabelText(/policy number/i)

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await expect(args.updatePolicyFn).toHaveBeenCalledWith(
      900,
      expect.objectContaining({
        policyNumber: 'POL-123',
        vehicles: expect.arrayContaining([
          expect.objectContaining({ vin: policy.vehicles[0].vin }),
        ]),
        drivers: expect.arrayContaining([
          expect.objectContaining({ kind: 'existing', personId: 229 }),
        ]),
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: /edit policy/i })).not.toBeInTheDocument()
    )
  },
}

export const ServerError: Story = {
  args: {
    updatePolicyFn: fn(async () => {
      throw new ApiError(409, 'Policy number already exists')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^edit$/i }))
    await screen.findByLabelText(/policy number/i)

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await expect(await screen.findByText('Policy number already exists')).toBeInTheDocument()
    await expect(screen.getByRole('heading', { name: /edit policy/i })).toBeInTheDocument()
  },
}
