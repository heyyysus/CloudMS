import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { DriverDetailDialog } from './driver-detail-dialog'
import type { PolicyDriver } from '@/api/policies'

const driver: PolicyDriver = {
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
}

const meta = {
  title: 'clients/DriverDetailDialog',
  component: DriverDetailDialog,
  tags: ['autodocs'],
  args: {
    onOpenChange: fn(),
  },
} satisfies Meta<typeof DriverDetailDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Open: Story = {
  args: { driver },
}

export const Closed: Story = {
  args: { driver: null },
}
