import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, within } from 'storybook/test'
import { PolicyCard } from './policy-card'
import type { AutoPolicy } from '@/api/clients'
import type { PolicyDetail } from '@/api/policies'

// Expiration dates in fixtures must be far-future (or clearly past): the card
// displays a policy as expired once its expiration date passes.
const bare: AutoPolicy = {
  id: 104,
  clientId: 155,
  carrierId: 140,
  policyNumber: 'SMOKE-POL-001',
  policyAddress1: null,
  policyAddress2: null,
  policyCity: null,
  policyState: null,
  policyZip: null,
  effectiveDate: '2026-01-01',
  expirationDate: '2099-01-01',
  status: 'active',
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
}

const detail: PolicyDetail = {
  ...bare,
  client: {
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
  },
  carrier: {
    id: 140,
    name: 'SmokeCarrier',
    naic: 'SMK0000001',
    isActive: true,
    phone: null,
    email: null,
    website: null,
    producerCode: null,
    notes: null,
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
  vehicles: [
    {
      id: 1,
      policyId: 104,
      vin: '1HGCM82633A123456',
      make: 'Honda',
      model: 'Accord',
      year: 2020,
      garagingZip: '90210',
      coverageBi: '100/300',
      coveragePd: '50000',
      coverageUmbi: null,
      coverageUmpd: null,
      coverageCdw: null,
      coverageMedpay: null,
      coverageColl: '500 ded',
      coverageComp: '250 ded',
      coverageRentalReimbursement: null,
      coverageTowing: null,
      createdAt: '2026-07-14T17:48:07.653Z',
      updatedAt: '2026-07-14T17:48:07.653Z',
    },
  ],
  policyDrivers: [
    {
      id: 60,
      policyId: 104,
      driverId: 61,
      createdAt: '2026-07-14T17:48:07.653Z',
      driver: {
        id: 61,
        personId: 229,
        dlNumber: 'D1234567',
        rating: 'rated',
        sr22: false,
        person: {
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
      },
    },
  ],
}

const meta = {
  title: 'clients/PolicyCard',
  component: PolicyCard,
  tags: ['autodocs'],
  args: {
    policy: bare,
  },
} satisfies Meta<typeof PolicyCard>

export default meta
type Story = StoryObj<typeof meta>

export const Loaded: Story = {
  args: {
    detail,
  },
}

export const ClickDriverOpensDialog: Story = {
  args: {
    detail,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /view doe, jane/i }))
    // The dialog renders through a portal, outside canvasElement.
    await expect(await screen.findByRole('heading', { name: /doe, jane/i })).toBeInTheDocument()
    await expect(screen.getByText('D1234567')).toBeInTheDocument()
  },
}

export const ClickVehicleOpensDialog: Story = {
  args: {
    detail,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /view 2020 honda accord/i }))
    // The dialog renders through a portal, outside canvasElement.
    await expect(await screen.findByRole('heading', { name: /2020 honda accord/i })).toBeInTheDocument()
    await expect(screen.getByText(detail.vehicles[0].vin)).toBeInTheDocument()
  },
}

export const LoadingVehicles: Story = {
  args: {
    isLoading: true,
  },
}

export const VehicleFetchError: Story = {
  args: {
    isError: true,
  },
}

export const DateExpired: Story = {
  args: {
    policy: { ...bare, status: 'active', expirationDate: '2020-01-01' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('expired')).toBeInTheDocument()
    await expect(canvas.queryByText('active')).not.toBeInTheDocument()
  },
}

export const Pending: Story = {
  args: {
    policy: { ...bare, status: 'pending' },
  },
}

export const Cancelled: Story = {
  args: {
    policy: { ...bare, status: 'cancelled' },
  },
}
