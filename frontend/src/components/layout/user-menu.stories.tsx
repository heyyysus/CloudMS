import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter } from 'react-router'
import { UserMenu } from './user-menu'

const meta = {
  title: 'layout/UserMenu',
  component: UserMenu,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof UserMenu>

export default meta
type Story = StoryObj<typeof meta>

export const Admin: Story = {
  args: {
    user: { id: 1, email: 'jesus@cloudms.dev', name: 'Jesus Velarde', role: 'admin' },
  },
}

export const StaffNoName: Story = {
  args: {
    user: { id: 2, email: 'staff@cloudms.dev', name: null, role: 'staff' },
  },
}
