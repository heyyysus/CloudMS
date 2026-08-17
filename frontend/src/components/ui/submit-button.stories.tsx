import type { Meta, StoryObj } from '@storybook/react-vite'
import { SubmitButton } from './submit-button'

const meta = {
  title: 'ui/SubmitButton',
  component: SubmitButton,
  tags: ['autodocs'],
  args: {
    children: 'Add log',
    pendingLabel: 'Saving…',
  },
} satisfies Meta<typeof SubmitButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

// While the mutation runs the button is disabled and the hint gives way to
// the pending label, so the shortcut never looks available when it isn't.
export const Pending: Story = {
  args: {
    isPending: true,
  },
}

export const States: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <SubmitButton {...args} />
      <SubmitButton {...args} isPending />
      <SubmitButton {...args} disabled />
    </div>
  ),
}
