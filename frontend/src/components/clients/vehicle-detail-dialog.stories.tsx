import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { VehicleDetailDialog } from './vehicle-detail-dialog'
import type { Vehicle } from '@/api/policies'

const vehicle: Vehicle = {
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
}

const meta = {
  title: 'clients/VehicleDetailDialog',
  component: VehicleDetailDialog,
  tags: ['autodocs'],
  args: {
    onOpenChange: fn(),
  },
} satisfies Meta<typeof VehicleDetailDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  args: { vehicle },
}

export const NoCoverages: Story = {
  args: {
    vehicle: {
      ...vehicle,
      coverageBi: null,
      coveragePd: null,
      coverageColl: null,
      coverageComp: null,
    },
  },
}

export const Closed: Story = {
  args: { vehicle: null },
}
