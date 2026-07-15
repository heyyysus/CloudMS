import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
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
  policyAddress: null,
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
    mailingAddress: null,
    physicalAddress: null,
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
  carrier: {
    id: 140,
    name: 'SmokeCarrier',
    naic: 'SMK0000001',
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
  policyDrivers: [],
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
