import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { EditClientForm } from './edit-client-dialog'
import type { ClientDetail } from '@/api/clients'

const fixture: Omit<ClientDetail, 'policies'> = {
  id: 155,
  namedInsuredId: 229,
  secondNamedInsuredId: null,
  mailingAddress1: '42 Wallaby Way, Sydney',
  mailingAddress2: null,
  mailingCity: null,
  mailingState: null,
  mailingZip: null,
  physicalAddress1: '1 Ocean Ave, Sydney',
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
}

const meta = {
  title: 'clients/EditClientForm',
  component: EditClientForm,
  tags: ['autodocs'],
  args: {
    client: fixture,
    onSubmit: fn(),
  },
} satisfies Meta<typeof EditClientForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mailingGroup = within(canvas.getByRole('group', { name: /mailing address/i }))
    await expect(mailingGroup.getByLabelText(/address line 1/i)).toHaveValue(
      fixture.mailingAddress1
    )
    await expect(canvas.getByLabelText(/phone 1/i)).toHaveValue('555-867-5309')
    await expect(canvas.getByLabelText(/email 1/i)).toHaveValue('jane@example.com')
  },
}

export const ValidationErrors: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.clear(canvas.getByLabelText(/phone 1/i))
    await userEvent.clear(canvas.getByLabelText(/email 1/i))
    await userEvent.type(canvas.getByLabelText(/email 1/i), 'not-an-email')
    await userEvent.click(canvas.getByRole('button', { name: /^save$/i }))
    await expect(await canvas.findByText(/phone number is required/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/enter a valid email address/i)).toBeInTheDocument()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const AddAndRemoveRows: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /add phone/i }))
    await expect(canvas.getByLabelText(/phone 2/i)).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /remove email/i }))
    await expect(canvas.queryByLabelText(/email 1/i)).not.toBeInTheDocument()
  },
}

export const SubmitTransformsValues: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const mailingGroup = within(canvas.getByRole('group', { name: /mailing address/i }))
    const physicalGroup = within(canvas.getByRole('group', { name: /physical address/i }))
    await userEvent.clear(mailingGroup.getByLabelText(/address line 1/i))
    await userEvent.clear(physicalGroup.getByLabelText(/address line 1/i))
    await userEvent.type(physicalGroup.getByLabelText(/address line 1/i), '99 New St')
    await userEvent.click(canvas.getByRole('button', { name: /^save$/i }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      mailingAddress1: null,
      mailingAddress2: null,
      mailingCity: null,
      mailingState: null,
      mailingZip: null,
      physicalAddress1: '99 New St',
      physicalAddress2: null,
      physicalCity: null,
      physicalState: null,
      physicalZip: null,
      phones: ['555-867-5309'],
      emails: ['jane@example.com'],
    })
  },
}
