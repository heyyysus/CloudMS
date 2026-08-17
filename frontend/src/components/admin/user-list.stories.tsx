import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { ManageUsersCard } from './user-list'
import { ApiError } from '@/api/client'
import type { AdminUser } from '@/api/users'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const users: AdminUser[] = [
  {
    id: 1,
    email: 'owner@example.com',
    name: 'Ada Owner',
    role: 'admin',
    isActive: true,
    hasSignedIn: true,
    createdAt: '2026-01-04T00:00:00.000Z',
    updatedAt: '2026-01-04T00:00:00.000Z',
  },
  {
    id: 2,
    email: 'staffer@example.com',
    name: 'Blake Staffer',
    role: 'staff',
    isActive: true,
    hasSignedIn: true,
    createdAt: '2026-02-10T00:00:00.000Z',
    updatedAt: '2026-02-10T00:00:00.000Z',
  },
  {
    id: 3,
    email: 'invited@example.com',
    name: null,
    role: 'staff',
    isActive: true,
    hasSignedIn: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 4,
    email: 'former@example.com',
    name: 'Casey Former',
    role: 'staff',
    isActive: false,
    hasSignedIn: true,
    createdAt: '2025-05-05T00:00:00.000Z',
    updatedAt: '2026-07-07T00:00:00.000Z',
  },
]

const meta = {
  title: 'admin/ManageUsersCard',
  component: ManageUsersCard,
  tags: ['autodocs'],
  args: {
    currentUserId: 1,
    getUsersFn: fn(async () => users),
    updateUserFn: fn(async (id: number) => ({
      ...users.find((u) => u.id === id)!,
      name: 'Updated',
    })),
    resendWelcomeFn: fn(async () => ({ email: { status: 'sent' as const, resendId: 'msg_1' } })),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ManageUsersCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await expect(await canvas.findByText('Ada Owner')).toBeInTheDocument()
    await expect(canvas.getByText('Casey Former')).toBeInTheDocument()
    // An invited user with no name falls back to their email.
    await expect(canvas.getAllByText('invited@example.com').length).toBeGreaterThan(0)
    await expect(canvas.getByText('Disabled')).toBeInTheDocument()
    await expect(canvas.getByText('Invited')).toBeInTheDocument()
  },
}

export const PromotesAStaffUser: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Blake Staffer')

    await userEvent.click(canvas.getByRole('button', { name: /actions for blake staffer/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Make admin' }))

    await expect(args.updateUserFn).toHaveBeenCalledWith(2, { role: 'admin' })
  },
}

export const DisablesAUser: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Blake Staffer')

    await userEvent.click(canvas.getByRole('button', { name: /actions for blake staffer/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Disable account' }))

    await expect(args.updateUserFn).toHaveBeenCalledWith(2, { isActive: false })
  },
}

// The server rejects both outright, so the menu never offers them.
export const OwnRowCannotSelfDemoteOrDisable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Ada Owner')
    await expect(canvas.getByText('(you)')).toBeInTheDocument()

    await userEvent.click(canvas.getByRole('button', { name: /actions for ada owner/i }))

    await expect(await screen.findByRole('menuitem', { name: 'Make staff' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await expect(screen.getByRole('menuitem', { name: 'Disable account' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await expect(screen.getByRole('menuitem', { name: 'Edit' })).not.toHaveAttribute(
      'aria-disabled',
      'true'
    )
  },
}

export const ResendsTheWelcomeEmail: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Blake Staffer')

    await userEvent.click(canvas.getByRole('button', { name: /actions for blake staffer/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Resend welcome email' }))

    await expect(args.resendWelcomeFn).toHaveBeenCalledWith(2)
  },
}

export const Loading: Story = {
  args: {
    getUsersFn: fn(() => new Promise<AdminUser[]>(() => {})),
  },
}

export const LoadError: Story = {
  args: {
    getUsersFn: fn(async () => {
      throw new ApiError(500, 'Server error')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/failed to load users/i)).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: { getUsersFn: fn(async () => []) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No users.')).toBeInTheDocument()
  },
}
