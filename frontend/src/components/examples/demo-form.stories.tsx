import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DemoForm } from './demo-form'

const meta = {
  title: 'examples/DemoForm',
  component: DemoForm,
  tags: ['autodocs'],
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof DemoForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ValidationErrors: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /invite user/i }))
    await expect(await canvas.findByText(/name must be at least 2 characters/i)).toBeInTheDocument()
    await expect(await canvas.findByText(/enter a valid email address/i)).toBeInTheDocument()
  },
}
