import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent } from 'storybook/test'
import { EditUserDialog } from './edit-user-dialog'
import type { AdminUser } from '@/api/users'

const user: AdminUser = {
  id: 2,
  email: 'staffer@example.com',
  name: 'Blake Staffer',
  role: 'staff',
  isActive: true,
  hasSignedIn: true,
  createdAt: '2026-02-10T00:00:00.000Z',
  updatedAt: '2026-02-10T00:00:00.000Z',
}

const meta = {
  title: 'admin/EditUserDialog',
  component: EditUserDialog,
  tags: ['autodocs'],
  args: {
    user,
    open: true,
    onOpenChange: fn(),
    onSubmit: fn(),
  },
} satisfies Meta<typeof EditUserDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args }) => {
    // Email identifies the Google account, so it is shown but not editable.
    await expect(await screen.findByLabelText('Email')).toBeDisabled()

    const name = screen.getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Blake Renamed')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: 'Blake Renamed',
      role: 'staff',
      isActive: true,
    })
  },
}

// Clearing the name sends null rather than an empty string.
export const ClearingTheNameSendsNull: Story = {
  play: async ({ args }) => {
    await userEvent.clear(await screen.findByLabelText('Name'))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: null,
      role: 'staff',
      isActive: true,
    })
  },
}

export const OwnRowLocksRoleAndStatus: Story = {
  args: { isSelf: true },
  play: async () => {
    await expect(await screen.findByLabelText('Role')).toBeDisabled()
    await expect(screen.getByLabelText('Status')).toBeDisabled()
    await expect(screen.getByLabelText('Name')).not.toBeDisabled()
  },
}

export const ServerError: Story = {
  args: {
    errorMessage: 'You cannot change your own role',
  },
  play: async () => {
    await expect(await screen.findByRole('alert')).toHaveTextContent(
      /cannot change your own role/i
    )
  },
}

export const Saving: Story = {
  args: { isPending: true },
}
