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
          hasSignedIn: false,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
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
          hasSignedIn: false,
          createdAt: '2026-08-14T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
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

    // The same message renders in both the inline alert and an error toast,
    // so scope to the alert role to avoid a multiple-match on the text alone.
    await waitFor(async () =>
      expect(await screen.findByRole('alert')).toHaveTextContent(
        /a user with this email already exists/i
      )
    )
  },
}

// A deleted user's email surfaces this shape of 409 (see deletedUserId on
// backend/src/routes/users.ts) instead of the plain duplicate-email message.
export const OfferstoRestoreADeletedUser: Story = {
  args: {
    inviteUserFn: fn(async () => {
      throw new ApiError(409, 'This email belonged to a deleted user', { deletedUserId: 7 })
    }),
    restoreUserFn: fn(
      async (): Promise<InviteUserResult> => ({
        user: {
          id: 7,
          email: 'wasdeleted@example.com',
          name: 'Riley Restored',
          role: 'staff',
          isActive: true,
          hasSignedIn: true,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2026-08-14T00:00:00.000Z',
        },
        email: { status: 'sent', resendId: 'msg_restore' },
      })
    ),
  },
  play: async ({ canvasElement, args }) => {
    await fillAndSubmit(canvasElement, 'wasdeleted@example.com')

    const alert = await screen.findByRole('alert')
    await expect(alert).toHaveTextContent('wasdeleted@example.com belonged to a deleted user')

    await userEvent.click(within(alert).getByRole('button', { name: 'Restore' }))
    await expect(args.restoreUserFn).toHaveBeenCalledWith(7)
    await expect(await screen.findByText(/user restored/i)).toBeInTheDocument()
  },
}
