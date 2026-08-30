import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { DemoSignInForm } from './demo-sign-in-form'
import { ApiError } from '@/api/client'
import type { User } from '@/api/auth'

const demoUser: User = { id: 1, email: 'demo-abc@example.com', name: 'Ada', role: 'admin' }

const meta = {
  title: 'auth/DemoSignInForm',
  component: DemoSignInForm,
  tags: ['autodocs'],
  args: {
    onSignedIn: fn(),
    signInFn: fn(async () => demoUser),
  },
  decorators: [
    (Story) => (
      <div className="w-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DemoSignInForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SignsIn: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Display name'), 'Ada')
    await userEvent.click(canvas.getByRole('button', { name: 'Enter demo' }))
    await expect(args.signInFn).toHaveBeenCalledWith('Ada')
    await expect(args.onSignedIn).toHaveBeenCalledWith(demoUser)
  },
}

export const RequiresAName: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Enter demo' }))
    await expect(await canvas.findByText('Enter a name')).toBeInTheDocument()
    await expect(args.signInFn).not.toHaveBeenCalled()
  },
}

export const Busy: Story = {
  args: {
    signInFn: fn(async () => {
      throw new ApiError(429, 'Too many requests')
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Display name'), 'Ada')
    await userEvent.click(canvas.getByRole('button', { name: 'Enter demo' }))
    await expect(
      await canvas.findByText('The demo is busy right now — try again in a moment.')
    ).toBeInTheDocument()
    await expect(args.onSignedIn).not.toHaveBeenCalled()
  },
}
