import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { SearchPalette } from './search-palette'
import type { SearchResponse } from '@/api/search'

const fixture: SearchResponse = {
  clients: [
    {
      id: 155,
      namedInsuredId: 229,
      secondNamedInsuredId: null,
      mailingAddress1: '42 Wallaby Way',
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
      phones: [{ id: 26, clientId: 155, phoneNumber: '555-867-5309', createdAt: '2026-07-14T17:48:07.653Z' }],
      emails: [{ id: 14, clientId: 155, email: 'jane@example.com', createdAt: '2026-07-14T17:48:07.653Z' }],
    },
  ],
  policies: [
    {
      id: 104,
      policyNumber: 'SMOKE-POL-001',
      status: 'pending',
      effectiveDate: '2026-01-01',
      expirationDate: '2027-01-01',
      clientId: 155,
      clientName: 'Jane Doe',
    },
  ],
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'search/SearchPalette',
  component: SearchPalette,
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    onSelectClient: fn(),
    onSelectPolicy: fn(),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof SearchPalette>

export default meta
type Story = StoryObj<typeof meta>

export const ShortQuery: Story = {
  args: {
    searchFn: fn(async () => fixture),
  },
}

export const WithResults: Story = {
  args: {
    searchFn: fn(async () => fixture),
  },
  play: async () => {
    const input = screen.getByPlaceholderText(/search clients or policies/i)
    await userEvent.type(input, 'Doe')
    await expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    await expect(await screen.findByText('SMOKE-POL-001')).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: {
    searchFn: fn(async () => ({ clients: [], policies: [] })),
  },
  play: async () => {
    const input = screen.getByPlaceholderText(/search clients or policies/i)
    await userEvent.type(input, 'zzz')
    await expect(await screen.findByText(/no results for/i)).toBeInTheDocument()
  },
}
