import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { AddClientDialog } from './add-client-dialog'
import { ApiError } from '@/api/client'
import type { ClientDetail, Person } from '@/api/clients'

const personFixture: Person = {
  id: 301,
  firstName: 'John',
  lastName: 'Smith',
  dateOfBirth: '1990-01-01',
  maritalStatus: null,
  gender: 'm',
  relationToInsured: 'self',
  createdAt: '2026-07-19T12:00:00.000Z',
  updatedAt: '2026-07-19T12:00:00.000Z',
}

const clientFixture: ClientDetail = {
  id: 400,
  namedInsuredId: personFixture.id,
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
  createdAt: '2026-07-19T12:00:00.000Z',
  updatedAt: '2026-07-19T12:00:00.000Z',
  namedInsured: personFixture,
  secondNamedInsured: null,
  phones: [],
  emails: [],
  policies: [],
}

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'clients/AddClientDialog',
  component: AddClientDialog,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof AddClientDialog>

export default meta
type Story = StoryObj<typeof meta>

export const OpensEmpty: Story = {
  args: {
    createPersonFn: fn(async () => personFixture),
    createClientFn: fn(async () => clientFixture),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /new client/i }))
    await expect(await screen.findByText(/add client/i)).toBeInTheDocument()
    await expect(screen.getByLabelText(/first name/i)).toHaveValue('')
  },
}

export const SubmitCreatesAndCloses: Story = {
  args: {
    createPersonFn: fn(async () => personFixture),
    createClientFn: fn(async () => clientFixture),
    onCreated: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /new client/i }))
    await screen.findByText(/add client/i)

    await userEvent.type(screen.getByLabelText(/first name/i), 'John')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Smith')
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1990-01-01')
    await userEvent.click(screen.getByRole('button', { name: /^create client$/i }))

    await expect(args.createPersonFn).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'John', lastName: 'Smith', relationToInsured: 'self' })
    )
    await waitFor(() =>
      expect(args.createClientFn).toHaveBeenCalledWith(
        expect.objectContaining({ namedInsuredId: personFixture.id })
      )
    )
    await waitFor(() => expect(screen.queryByText(/add client/i)).not.toBeInTheDocument())
    await expect(args.onCreated).toHaveBeenCalledWith(clientFixture)
  },
}

export const ServerError: Story = {
  args: {
    createPersonFn: fn(async () => personFixture),
    createClientFn: fn(async () => {
      throw new ApiError(400, 'Invalid ZIP')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /new client/i }))
    await screen.findByText(/add client/i)

    await userEvent.type(screen.getByLabelText(/first name/i), 'John')
    await userEvent.type(screen.getByLabelText(/last name/i), 'Smith')
    await userEvent.type(screen.getByLabelText(/date of birth/i), '1990-01-01')
    await userEvent.click(screen.getByRole('button', { name: /^create client$/i }))

    await expect(await screen.findByText('Invalid ZIP')).toBeInTheDocument()
    await expect(screen.getByText(/add client/i)).toBeInTheDocument()
  },
}
