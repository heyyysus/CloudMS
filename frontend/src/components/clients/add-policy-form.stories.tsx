import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fireEvent, fn, screen, userEvent, within } from 'storybook/test'
import { AddPolicyForm, type ExistingDriverOption } from './add-policy-dialog'
import type { Carrier, Vehicle } from '@/api/policies'
import type { ClientDetail } from '@/api/clients'

const client: Pick<ClientDetail, 'mailingAddress' | 'physicalAddress'> = {
  mailingAddress: '42 Wallaby Way, Sydney',
  physicalAddress: '1 Ocean Ave, Sydney',
}

const carriers: Carrier[] = [
  {
    id: 7,
    name: 'Acme Insurance',
    naic: '12345',
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
  {
    id: 8,
    name: 'Umbrella Corp',
    naic: '54321',
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
]

const existingVehicles: Vehicle[] = [
  {
    id: 501,
    policyId: 900,
    vin: '1HGCM82633A004352',
    make: 'Honda',
    model: 'Accord',
    year: 2018,
    garagingZip: '90210',
    coverageBi: '50/100',
    coveragePd: '25',
    coverageUmbi: null,
    coverageUmpd: null,
    coverageCdw: null,
    coverageMedpay: null,
    coverageColl: '500',
    coverageComp: '500',
    coverageRentalReimbursement: null,
    coverageTowing: null,
    createdAt: '2026-07-14T17:48:07.653Z',
    updatedAt: '2026-07-14T17:48:07.653Z',
  },
]

const existingDrivers: ExistingDriverOption[] = [
  {
    personId: 229,
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
  {
    personId: 230,
    person: {
      id: 230,
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1985-03-11',
      maritalStatus: 'married',
      gender: 'm',
      relationToInsured: 'spouse',
      createdAt: '2026-07-14T17:48:07.653Z',
      updatedAt: '2026-07-14T17:48:07.653Z',
    },
    driver: { dlNumber: 'D1234567', rating: 'rated', sr22: false },
  },
]

const meta = {
  title: 'clients/AddPolicyForm',
  component: AddPolicyForm,
  tags: ['autodocs'],
  args: {
    clientId: 155,
    client,
    carriers,
    existingVehicles,
    existingDrivers,
    onSubmit: fn(),
  },
} satisfies Meta<typeof AddPolicyForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText(/policy address/i)).toHaveValue(client.physicalAddress)
    await expect(canvas.getByRole('combobox', { name: /term/i })).toHaveTextContent(/6 months/i)
    await expect(canvas.getByRole('checkbox', { name: /jane doe/i })).not.toBeChecked()
    await expect(canvas.getByRole('checkbox', { name: /john doe/i })).not.toBeChecked()
  },
}

export const AddressSwap: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /use mailing/i }))
    await expect(canvas.getByLabelText(/policy address/i)).toHaveValue(client.mailingAddress)
    await userEvent.click(canvas.getByRole('button', { name: /use physical/i }))
    await expect(canvas.getByLabelText(/policy address/i)).toHaveValue(client.physicalAddress)
  },
}

export const TermUpdatesExpiration: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await fireEvent.change(canvas.getByLabelText(/effective date/i), {
      target: { value: '2026-01-15' },
    })
    await expect(canvas.getByLabelText(/expiration date/i)).toHaveValue('2026-07-15')

    await userEvent.click(canvas.getByRole('combobox', { name: /term/i }))
    await userEvent.click(await screen.findByRole('option', { name: /12 months/i }))
    await expect(canvas.getByLabelText(/expiration date/i)).toHaveValue('2027-01-15')
  },
}

export const CopyFromExistingVehicle: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /2018 honda accord/i }))
    await expect(canvas.getByLabelText(/^vin$/i)).toHaveValue('1HGCM82633A004352')
    await expect(canvas.getByLabelText(/^year$/i)).toHaveValue('2018')
    await expect(canvas.getByLabelText(/collision/i)).toHaveValue('500')
  },
}

export const ValidationErrors: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Checking a person without a drivers row requires a DL number.
    await userEvent.click(canvas.getByRole('checkbox', { name: /jane doe/i }))
    await userEvent.click(canvas.getByRole('button', { name: /create policy/i }))
    await expect(await canvas.findByText(/carrier is required/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/policy number is required/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/dl number is required/i)).toBeInTheDocument()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const SubmitFansOutCoverages: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)

    await userEvent.click(canvas.getByRole('combobox', { name: /carrier/i }))
    await userEvent.click(await screen.findByRole('option', { name: /acme insurance/i }))
    await userEvent.type(canvas.getByLabelText(/policy number/i), 'POL-123')
    await userEvent.type(canvas.getByLabelText(/^bi$/i), '100/300')

    await userEvent.click(canvas.getByRole('button', { name: /2018 honda accord/i }))

    // Existing person without a drivers row: DL fields appear when checked.
    await userEvent.click(canvas.getByRole('checkbox', { name: /jane doe/i }))
    await userEvent.type(await canvas.findByLabelText(/dl number/i), 'D999')
    // Existing person with a drivers row: no extra fields needed.
    await userEvent.click(canvas.getByRole('checkbox', { name: /john doe/i }))

    await userEvent.click(canvas.getByRole('button', { name: /create policy/i }))

    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 155,
        carrierId: 7,
        policyNumber: 'POL-123',
        vehicles: [
          expect.objectContaining({
            vin: '1HGCM82633A004352',
            year: 2018,
            coverageBi: '100/300',
            coveragePd: null,
            coverageColl: '500',
          }),
        ],
        drivers: [
          expect.objectContaining({ kind: 'existing', personId: 229, dlNumber: 'D999' }),
          { kind: 'existing', personId: 230 },
        ],
      })
    )
  },
}
