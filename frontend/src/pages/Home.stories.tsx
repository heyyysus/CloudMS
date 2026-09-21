import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, fn, screen, userEvent, waitFor } from 'storybook/test'
import Home from './Home'
import { ClientTabsProvider } from '@/components/layout/client-tabs'
import type { ClientListItem } from '@/api/clients'

const jane: ClientListItem = {
  id: 'client-jane',
  namedInsuredId: 'person-jane',
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
    id: 'person-jane',
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
  emails: [{ id: 'email-jane', clientId: 'client-jane', email: 'jane@example.com', createdAt: '2026-07-14T17:48:07.653Z' }],
}

const bob: ClientListItem = {
  ...jane,
  id: 'client-bob',
  namedInsuredId: 'person-bob',
  namedInsured: {
    ...jane.namedInsured,
    id: 'person-bob',
    firstName: 'Bob',
    lastName: 'Smith',
  },
  emails: [{ id: 'email-bob', clientId: 'client-bob', email: 'bob@example.com', createdAt: '2026-07-14T17:48:07.653Z' }],
}

const fixture = [jane, bob]

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'pages/Home',
  component: Home,
  parameters: { layout: 'fullscreen' },
  args: {
    listClientsFn: fn(async (q?: string) =>
      q ? fixture.filter((c) => `${c.namedInsured.firstName} ${c.namedInsured.lastName}`.toLowerCase().includes(q.toLowerCase())) : fixture
    ),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={['/home']}>
          <ClientTabsProvider>
            <Routes>
              <Route path="/home" element={<Story />} />
              <Route path="/clients/:clientId" element={<p>client page</p>} />
            </Routes>
          </ClientTabsProvider>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof Home>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async () => {
    await expect(await screen.findByText('Doe, Jane')).toBeInTheDocument()
    await expect(await screen.findByText('Smith, Bob')).toBeInTheDocument()
  },
}

export const TypingFilters: Story = {
  play: async () => {
    await screen.findByText('Doe, Jane')
    const input = screen.getByPlaceholderText(/search clients/i)
    await userEvent.type(input, 'Jane')
    await expect(await screen.findByText('Doe, Jane')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Smith, Bob')).not.toBeInTheDocument())
  },
}

export const ClearingRestores: Story = {
  play: async () => {
    await screen.findByText('Doe, Jane')
    const input = screen.getByPlaceholderText(/search clients/i)
    await userEvent.type(input, 'Jane')
    await waitFor(() => expect(screen.queryByText('Smith, Bob')).not.toBeInTheDocument())
    await userEvent.clear(input)
    await expect(await screen.findByText('Smith, Bob')).toBeInTheDocument()
    await expect(await screen.findByText('Doe, Jane')).toBeInTheDocument()
  },
}

export const EmptyState: Story = {
  args: {
    listClientsFn: fn(async () => []),
  },
  play: async () => {
    await expect(await screen.findByText('No clients yet')).toBeInTheDocument()
  },
}

export const OpensClientTab: Story = {
  play: async () => {
    const row = await screen.findByRole('button', { name: /Doe, Jane/ })
    await userEvent.click(row)
    await expect(await screen.findByText('client page')).toBeInTheDocument()
  },
}
