import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { AddClientForm } from './add-client-dialog'
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
  title: 'clients/AddClientForm',
  component: AddClientForm,
  tags: ['autodocs'],
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof AddClientForm>

export default meta
type Story = StoryObj<typeof meta>

export const CreateMode: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/first name/i)).toHaveValue('')
    await expect(canvas.getByLabelText(/last name/i)).toHaveValue('')
    await expect(canvas.getByRole('button', { name: /^create client$/i })).toBeInTheDocument()
    await expect(canvas.queryByLabelText(/phone 1/i)).not.toBeInTheDocument()
  },
}

export const EditModePrefills: Story = {
  args: {
    initial: fixture,
    submitLabel: 'Save',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/first name/i)).toHaveValue('Jane')
    await expect(canvas.getByLabelText(/last name/i)).toHaveValue('Doe')
    await expect(canvas.getByLabelText(/date of birth/i)).toHaveValue('1987-07-22')
    const mailingGroup = within(canvas.getByRole('group', { name: /^mailing address$/i }))
    await expect(mailingGroup.getByLabelText(/address line 1/i)).toHaveValue(
      fixture.mailingAddress1
    )
    await expect(canvas.getByLabelText(/phone 1/i)).toHaveValue('555-867-5309')
    await expect(canvas.getByLabelText(/email 1/i)).toHaveValue('jane@example.com')
    await expect(canvas.getByRole('button', { name: /^save$/i })).toBeInTheDocument()
  },
}

export const ValidationErrors: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /^create client$/i }))
    await expect(await canvas.findByText(/first name is required/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/last name is required/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/enter a valid date/i)).toBeInTheDocument()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const AddAndRemoveRows: Story = {
  args: {
    initial: fixture,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /add phone/i }))
    await expect(canvas.getByLabelText(/phone 2/i)).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /remove email/i }))
    await expect(canvas.queryByLabelText(/email 1/i)).not.toBeInTheDocument()
  },
}

export const PhysicalSameAsMailing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const mailingGroup = within(canvas.getByRole('group', { name: /^mailing address$/i }))
    const physicalGroup = within(canvas.getByRole('group', { name: /physical address/i }))

    await userEvent.type(mailingGroup.getByLabelText(/address line 1/i), '100 Main St')
    await userEvent.type(mailingGroup.getByLabelText(/city/i), 'Springfield')
    await userEvent.type(mailingGroup.getByLabelText(/zip/i), '62701')

    await userEvent.click(canvas.getByRole('checkbox', { name: /same as mailing address/i }))

    await expect(physicalGroup.getByLabelText(/address line 1/i)).toHaveValue('100 Main St')
    await expect(physicalGroup.getByLabelText(/city/i)).toHaveValue('Springfield')
    await expect(physicalGroup.getByLabelText(/zip/i)).toHaveValue('62701')
    await expect(physicalGroup.getByLabelText(/address line 1/i)).toBeDisabled()

    // Edits to mailing keep propagating while the checkbox stays checked.
    await userEvent.clear(mailingGroup.getByLabelText(/city/i))
    await userEvent.type(mailingGroup.getByLabelText(/city/i), 'Shelbyville')
    await expect(physicalGroup.getByLabelText(/city/i)).toHaveValue('Shelbyville')

    await userEvent.click(canvas.getByRole('checkbox', { name: /same as mailing address/i }))
    await expect(physicalGroup.getByLabelText(/address line 1/i)).toBeEnabled()
  },
}

export const SubmitTransformsValues: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText(/first name/i), 'John')
    await userEvent.type(canvas.getByLabelText(/last name/i), 'Smith')
    await userEvent.type(canvas.getByLabelText(/date of birth/i), '1990-01-01')
    await userEvent.click(canvas.getByRole('button', { name: /^create client$/i }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      person: {
        firstName: 'John',
        lastName: 'Smith',
        dateOfBirth: '1990-01-01',
        gender: 'm',
        maritalStatus: null,
        relationToInsured: 'self',
      },
      client: {
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
        phones: [],
        emails: [],
      },
    })
  },
}
