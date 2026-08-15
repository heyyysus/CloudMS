import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import { InviteUserCard } from './invite-user-form'
import { ApiError } from '@/api/client'
import type { InviteUserResult } from '@/api/users'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const meta = {
  title: 'admin/InviteUserCard',
  component: InviteUserCard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof InviteUserCard>

export default meta
type Story = StoryObj<typeof meta>

async function fillAndSubmit(canvasElement: HTMLElement, email: string) {
  const canvas = within(canvasElement)
  await userEvent.type(canvas.getByLabelText(/^email$/i), email)
  await userEvent.click(canvas.getByRole('button', { name: /invite user/i }))
}

export const EmailSent: Story = {
  args: {
    inviteUserFn: fn(
      async (): Promise<InviteUserResult> => ({
        user: {
          id: 1,
          email: 'newperson@example.com',
          name: null,
          role: 'staff',
          isActive: true,
          createdAt: '2026-08-14T00:00:00.000Z',
        },
        email: { status: 'sent', resendId: 'msg_1' },
      })
    ),
  },
  play: async ({ canvasElement, args }) => {
    await fillAndSubmit(canvasElement, 'newperson@example.com')

    await expect(args.inviteUserFn).toHaveBeenCalledWith(
      { email: 'newperson@example.com', name: null, role: 'staff' },
      expect.anything()
    )
    await expect(await screen.findByText(/welcome email sent/i)).toBeInTheDocument()
  },
}

export const EmailFailed: Story = {
  args: {
    inviteUserFn: fn(
      async (): Promise<InviteUserResult> => ({
        user: {
          id: 2,
          email: 'noreach@example.com',
          name: null,
          role: 'staff',
          isActive: true,
          createdAt: '2026-08-14T00:00:00.000Z',
        },
        email: { status: 'failed', error: 'Email sending is not configured' },
      })
    ),
  },
  play: async ({ canvasElement }) => {
    await fillAndSubmit(canvasElement, 'noreach@example.com')

    await expect(
      await screen.findByText(/welcome email failed: Email sending is not configured/i)
    ).toBeInTheDocument()
  },
}

export const ValidationBlocksEmptySubmit: Story = {
  args: {
    inviteUserFn: fn(async () => {
      throw new Error('should not be called')
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /invite user/i }))

    await expect(await canvas.findByText(/enter a valid email/i)).toBeInTheDocument()
    await expect(args.inviteUserFn).not.toHaveBeenCalled()
  },
}

export const DuplicateEmail: Story = {
  args: {
    inviteUserFn: fn(async () => {
      throw new ApiError(409, 'A user with this email already exists')
    }),
  },
  play: async ({ canvasElement }) => {
    await fillAndSubmit(canvasElement, 'existing@example.com')

    await waitFor(async () =>
      expect(
        await screen.findByText(/a user with this email already exists/i)
      ).toBeInTheDocument()
    )
  },
}
