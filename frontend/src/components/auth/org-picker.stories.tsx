import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router'
import { expect, fn, userEvent, within } from 'storybook/test'
import { OrgPicker } from './org-picker'
import type { Membership } from '@/api/auth'

const memberships: Membership[] = [
  { orgId: 'org-1', name: 'Acme Insurance', slug: 'acme', role: 'admin' },
  { orgId: 'org-2', name: 'Beacon Agency', slug: 'beacon', role: 'staff' },
]

const meta = {
  title: 'auth/OrgPicker',
  component: OrgPicker,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof OrgPicker>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { memberships, onSelect: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Acme Insurance')).toBeInTheDocument()
    await expect(canvas.getByText('Beacon Agency')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /Beacon Agency/ }))
    await expect(args.onSelect).toHaveBeenCalledWith('org-2')
  },
}

export const Pending: Story = {
  args: { memberships, onSelect: fn(), pending: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    for (const button of canvas.getAllByRole('button')) {
      await expect(button).toBeDisabled()
    }
  },
}
