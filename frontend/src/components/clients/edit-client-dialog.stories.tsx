import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { EditClientDialog } from './edit-client-dialog'
import { ApiError } from '@/api/client'
import type { ClientDetail } from '@/api/clients'

const fixture: Omit<ClientDetail, 'policies'> = {
  id: 155,
  namedInsuredId: 229,
  secondNamedInsuredId: null,
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
  secondNamedInsured: null,
  phones: [{ id: 26, clientId: 155, phoneNumber: '555-867-5309', createdAt: '2026-07-14T17:48:07.653Z' }],
  emails: [{ id: 14, clientId: 155, email: 'jane@example.com', createdAt: '2026-07-14T17:48:07.653Z' }],
}

const savedFixture: ClientDetail = { ...fixture, policies: [] }

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/EditClientDialog',
  component: EditClientDialog,
  tags: ['autodocs'],
  args: {
    client: fixture,
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof EditClientDialog>

export default meta
type Story = StoryObj<typeof meta>

export const OpensAndPrefills: Story = {
  args: {
    updateClientFn: fn(async () => savedFixture),
    updatePersonFn: fn(async () => fixture.namedInsured),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^edit$/i }))
    await expect(await screen.findByText(/edit client/i)).toBeInTheDocument()
    const mailingGroup = within(screen.getByRole('group', { name: /mailing address/i }))
    await expect(mailingGroup.getByLabelText(/address line 1/i)).toHaveValue(
      fixture.mailingAddress1
    )
  },
}

export const SubmitSavesAndCloses: Story = {
  args: {
    updateClientFn: fn(async () => savedFixture),
    updatePersonFn: fn(async () => fixture.namedInsured),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^edit$/i }))
    await screen.findByText(/edit client/i)

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await expect(args.updatePersonFn).toHaveBeenCalledWith(
      229,
      expect.objectContaining({ firstName: 'Jane', lastName: 'Doe', relationToInsured: 'self' })
    )
    await expect(args.updateClientFn).toHaveBeenCalledWith(
      155,
      expect.objectContaining({ phones: ['555-867-5309'], emails: ['jane@example.com'] })
    )
    await waitFor(() => expect(screen.queryByText(/edit client/i)).not.toBeInTheDocument())
  },
}

export const ServerError: Story = {
  args: {
    updateClientFn: fn(async () => {
      throw new ApiError(400, 'Invalid email')
    }),
    updatePersonFn: fn(async () => fixture.namedInsured),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^edit$/i }))
    await screen.findByText(/edit client/i)

    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await expect(await screen.findByText('Invalid email')).toBeInTheDocument()
    await expect(screen.getByText(/edit client/i)).toBeInTheDocument()
  },
}
