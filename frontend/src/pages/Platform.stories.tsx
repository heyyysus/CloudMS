import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test'
import Platform from './Platform'
import { ApiError } from '@/api/client'
import type { CreateOrganizationResult, OrganizationListItem } from '@/api/organizations'
import { ToastProvider } from '@/components/ui/toast'

const acme: OrganizationListItem = { id: 'org-1', name: 'Acme Insurance', slug: 'acme' }
const beacon: OrganizationListItem = { id: 'org-2', name: 'Beacon Agency', slug: 'beacon' }

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function createResult(): CreateOrganizationResult {
  return {
    organization: { id: 'org-3', name: 'New Org', slug: 'new-org' },
    admin: { id: 'usr-9', email: 'admin@neworg.test', name: null, role: 'admin' },
    email: { status: 'sent', resendId: 'msg_1' },
  }
}

async function fillForm(
  canvasElement: HTMLElement,
  values: { name: string; slug: string; adminEmail: string }
) {
  const canvas = within(canvasElement)
  await userEvent.type(canvas.getByLabelText('Organization name'), values.name)
  await userEvent.type(canvas.getByLabelText('Slug'), values.slug)
  await userEvent.type(canvas.getByLabelText('Admin email'), values.adminEmail)
  await userEvent.click(canvas.getByRole('button', { name: /create organization/i }))
}

const meta = {
  title: 'pages/Platform',
  component: Platform,
  parameters: { layout: 'fullscreen' },
  args: {
    listOrganizationsFn: fn(async () => [acme, beacon]),
    createOrganizationFn: fn(async () => createResult()),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/platform']}>
            <Story />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof Platform>

export default meta
type Story = StoryObj<typeof meta>

export const ListsOrganizations: Story = {
  play: async () => {
    await expect(await screen.findByText('Acme Insurance')).toBeInTheDocument()
    await expect(await screen.findByText('Beacon Agency')).toBeInTheDocument()
  },
}

export const EmptyState: Story = {
  args: {
    listOrganizationsFn: fn(async () => []),
  },
  play: async () => {
    await expect(await screen.findByText('No organizations yet.')).toBeInTheDocument()
  },
}

export const LoadError: Story = {
  args: {
    listOrganizationsFn: fn(async () => {
      throw new Error('boom')
    }),
  },
  play: async () => {
    await expect(await screen.findByText('Failed to load organizations.')).toBeInTheDocument()
  },
}

export const CreateSucceeds: Story = {
  play: async ({ canvasElement, args }) => {
    await screen.findByText('Acme Insurance')
    await fillForm(canvasElement, {
      name: 'New Org',
      slug: 'new-org',
      adminEmail: 'admin@neworg.test',
    })

    await expect(args.createOrganizationFn).toHaveBeenCalledWith(
      {
        name: 'New Org',
        slug: 'new-org',
        admin: { email: 'admin@neworg.test', name: null },
      },
      expect.anything()
    )
    await waitFor(() =>
      expect(within(canvasElement).getByLabelText('Organization name')).toHaveValue('')
    )
  },
}

export const DuplicateSlugKeepsForm: Story = {
  args: {
    createOrganizationFn: fn(async () => {
      throw new ApiError(409, 'An organization with this slug already exists')
    }),
  },
  play: async ({ canvasElement }) => {
    await screen.findByText('Acme Insurance')
    await fillForm(canvasElement, { name: 'Dupe Org', slug: 'acme', adminEmail: 'admin@dupe.test' })

    await expect(
      await within(canvasElement).findByText('An organization with this slug already exists')
    ).toBeInTheDocument()
    await expect(within(canvasElement).getByLabelText('Organization name')).toHaveValue('Dupe Org')
    await expect(within(canvasElement).getByLabelText('Slug')).toHaveValue('acme')
  },
}
