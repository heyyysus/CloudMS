import type { Meta, StoryObj } from '@storybook/react-vite'
import { ClientSummaryCard } from './client-summary-card'
import { Button } from '@/components/ui/button'
import type { ClientDetail } from '@/api/clients'

const fullClient: Omit<ClientDetail, 'policies'> = {
  id: 155,
  namedInsuredId: 229,
  secondNamedInsuredId: 230,
  mailingAddress1: '42 Wallaby Way',
  mailingAddress2: null,
  mailingCity: 'Sydney',
  mailingState: 'CA',
  mailingZip: '90001',
  physicalAddress1: '1 Ocean Ave',
  physicalAddress2: null,
  physicalCity: 'Sydney',
  physicalState: 'CA',
  physicalZip: '90002',
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
  secondNamedInsured: {
    id: 230,
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1985-03-10',
    maritalStatus: 'married',
    gender: 'm',
    relationToInsured: 'spouse',
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
  phones: [{ id: 26, clientId: 155, phoneNumber: '555-867-5309', createdAt: '2026-07-14T17:48:07.653Z' }],
  emails: [{ id: 14, clientId: 155, email: 'jane@example.com', createdAt: '2026-07-14T17:48:07.653Z' }],
}

const minimalClient: Omit<ClientDetail, 'policies'> = {
  ...fullClient,
  secondNamedInsuredId: null,
  secondNamedInsured: null,
  phones: [],
  emails: [],
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
}

const meta = {
  title: 'clients/ClientSummaryCard',
  component: ClientSummaryCard,
  tags: ['autodocs'],
} satisfies Meta<typeof ClientSummaryCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { client: fullClient },
}

export const Minimal: Story = {
  args: { client: minimalClient },
}

export const WithAction: Story = {
  args: {
    client: fullClient,
    action: (
      <Button size="sm" variant="outline">
        Edit
      </Button>
    ),
  },
}
