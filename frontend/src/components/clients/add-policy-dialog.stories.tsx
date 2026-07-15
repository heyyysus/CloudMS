import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { AddPolicyDialog } from './add-policy-dialog'
import { ApiError } from '@/api/client'
import type { ClientDetail } from '@/api/clients'
import type { Carrier, PolicyDetail } from '@/api/policies'

const client: ClientDetail = {
  id: 155,
  namedInsuredId: 229,
  secondNamedInsuredId: null,
  mailingAddress: '42 Wallaby Way, Sydney',
  physicalAddress: '1 Ocean Ave, Sydney',
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

const createdPolicy: PolicyDetail = {
  id: 900,
  clientId: 155,
  carrierId: 7,
  policyNumber: 'POL-123',
  policyAddress: '1 Ocean Ave, Sydney',
  effectiveDate: '2026-07-14',
  expirationDate: '2027-01-14',
  status: 'pending',
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
  client: {
    id: 155,
    namedInsuredId: 229,
    secondNamedInsuredId: null,
    mailingAddress: '42 Wallaby Way, Sydney',
    physicalAddress: '1 Ocean Ave, Sydney',
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
  carrier: carriers[0],
  vehicles: [],
  policyDrivers: [],
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/AddPolicyDialog',
  component: AddPolicyDialog,
  tags: ['autodocs'],
  args: {
    client,
    existingVehicles: [],
    existingDrivers: [
      { personId: 229, person: client.namedInsured },
    ],
    getCarriersFn: fn(async () => carriers),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AddPolicyDialog>

export default meta
type Story = StoryObj<typeof meta>

export const OpensAndPrefills: Story = {
  args: {
    createPolicyFn: fn(async () => createdPolicy),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /add policy/i }))
    await expect(await screen.findByRole('heading', { name: /add policy/i })).toBeInTheDocument()
    await expect(screen.getByLabelText(/policy address/i)).toHaveValue(client.physicalAddress)
    await expect(screen.getByRole('checkbox', { name: /jane doe/i })).toBeInTheDocument()
  },
}

export const SubmitSavesAndCloses: Story = {
  args: {
    createPolicyFn: fn(async () => createdPolicy),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /add policy/i }))
    await screen.findByLabelText(/policy number/i)

    await userEvent.click(screen.getByRole('combobox', { name: /carrier/i }))
    await userEvent.click(await screen.findByRole('option', { name: /acme insurance/i }))
    await userEvent.type(screen.getByLabelText(/policy number/i), 'POL-123')

    await userEvent.click(screen.getByRole('button', { name: /create policy/i }))

    await expect(args.createPolicyFn).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 155,
        carrierId: 7,
        policyNumber: 'POL-123',
        status: 'pending',
        policyAddress: '1 Ocean Ave, Sydney',
      })
    )
    await waitFor(() =>
      expect(screen.queryByLabelText(/policy number/i)).not.toBeInTheDocument()
    )
  },
}

export const ServerError: Story = {
  args: {
    createPolicyFn: fn(async () => {
      throw new ApiError(409, 'Policy number already exists')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /add policy/i }))
    await screen.findByLabelText(/policy number/i)

    await userEvent.click(screen.getByRole('combobox', { name: /carrier/i }))
    await userEvent.click(await screen.findByRole('option', { name: /acme insurance/i }))
    await userEvent.type(screen.getByLabelText(/policy number/i), 'POL-123')

    await userEvent.click(screen.getByRole('button', { name: /create policy/i }))

    await expect(await screen.findByText('Policy number already exists')).toBeInTheDocument()
    await expect(screen.getByLabelText(/policy number/i)).toBeInTheDocument()
  },
}
