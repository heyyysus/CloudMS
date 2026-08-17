import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CarrierForm } from './carrier-form'
import type { Carrier } from '@/api/carriers'

const carrier: Carrier = {
  id: 7,
  name: 'Acme Insurance',
  naic: '12345',
  isActive: true,
  phone: '555-0100',
  email: 'service@acme.example',
  website: 'https://acme.example',
  producerCode: 'PRD-42',
  notes: 'Preferred for commercial auto.',
  createdAt: '2026-07-14T17:48:07.653Z',
  updatedAt: '2026-07-14T17:48:07.653Z',
}

const meta = {
  title: 'admin/CarrierForm',
  component: CarrierForm,
  tags: ['autodocs'],
  args: {
    submitLabel: 'Add carrier',
    pendingLabel: 'Adding…',
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CarrierForm>

export default meta
type Story = StoryObj<typeof meta>

export const Blank: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText('Name'), 'New Mutual')
    await userEvent.type(canvas.getByLabelText('NAIC'), '99887')
    await userEvent.type(canvas.getByLabelText('Producer code'), 'PRD-7')
    await userEvent.click(canvas.getByRole('button', { name: 'Add carrier' }))

    // Untouched optional fields go over as null, not empty strings.
    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: 'New Mutual',
      naic: '99887',
      producerCode: 'PRD-7',
      phone: null,
      email: null,
      website: null,
      notes: null,
      isActive: true,
    })
  },
}

export const RequiresNameAndNaic: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Add carrier' }))

    await expect(await canvas.findByText('Name is required')).toBeInTheDocument()
    await expect(canvas.getByText('NAIC is required')).toBeInTheDocument()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const RejectsAMalformedEmail: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText('Name'), 'Bad Contact')
    await userEvent.type(canvas.getByLabelText('NAIC'), '12121')
    await userEvent.type(canvas.getByLabelText('Email'), 'not-an-email')
    await userEvent.click(canvas.getByRole('button', { name: 'Add carrier' }))

    await expect(await canvas.findByText('Enter a valid email address')).toBeInTheDocument()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const Editing: Story = {
  args: {
    initial: carrier,
    submitLabel: 'Save',
    pendingLabel: 'Saving…',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Name')).toHaveValue('Acme Insurance')
    await expect(canvas.getByLabelText('Producer code')).toHaveValue('PRD-42')
    await expect(canvas.getByLabelText('Website')).toHaveValue('https://acme.example')
  },
}

export const EditingAnInactiveCarrier: Story = {
  args: {
    initial: { ...carrier, isActive: false },
    submitLabel: 'Save',
    pendingLabel: 'Saving…',
  },
}

export const ServerError: Story = {
  args: {
    initial: carrier,
    submitLabel: 'Save',
    pendingLabel: 'Saving…',
    errorMessage: 'A carrier with this NAIC already exists',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toHaveTextContent(/NAIC already exists/i)
  },
}
