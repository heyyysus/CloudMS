import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, fn, userEvent, within } from 'storybook/test'
import SelectOrg from './SelectOrg'
import { AuthContext, type AuthContextValue } from '@/auth/auth-context'
import { ToastProvider } from '@/components/ui/toast'
import type { Membership, Org, User } from '@/api/auth'

const user: User = {
  id: 'usr-1',
  email: 'jane@acme.test',
  name: 'Jane Doe',
  isPlatformOwner: false,
}

const memberships: Membership[] = [
  { orgId: 'org-1', name: 'Acme Insurance', slug: 'acme', role: 'admin' },
  { orgId: 'org-2', name: 'Beacon Agency', slug: 'beacon', role: 'staff' },
]

const acme: Org = { id: 'org-1', name: 'Acme Insurance', slug: 'acme' }

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user,
    org: null,
    memberships,
    role: null,
    loading: false,
    setMe: fn(),
    setOrg: fn(async () => {}),
    ...overrides,
  }
}

// The page only reads auth from context, so each story fixes a context value
// rather than standing up AuthProvider. The router carries stand-in /login and
// /home routes so a redirect is observable as rendered text.
const meta = {
  title: 'pages/SelectOrg',
  component: SelectOrg,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, { parameters }) => (
      <QueryClientProvider client={new QueryClient()}>
        <AuthContext.Provider value={(parameters.auth as AuthContextValue) ?? auth()}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/select-org']}>
              <Routes>
                <Route path="/select-org" element={<Story />} />
                <Route path="/login" element={<p>login page</p>} />
                <Route path="/home" element={<p>home page</p>} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthContext.Provider>
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof SelectOrg>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Choose an organization')).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /Acme Insurance/ })).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /Beacon Agency/ })).toBeInTheDocument()
  },
}

// Picking an org calls setOrg and lands on /home.
export const SelectsAnOrg: Story = {
  parameters: { auth: auth() },
  play: async ({ canvasElement, parameters }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Beacon Agency/ }))

    const value = parameters.auth as AuthContextValue
    await expect(value.setOrg).toHaveBeenCalledWith('org-2')
    await expect(await canvas.findByText('home page')).toBeInTheDocument()
  },
}

// A failed switch keeps the user on the page so they can retry.
export const SelectFailureStaysPut: Story = {
  parameters: {
    auth: auth({
      setOrg: fn(async () => {
        throw new Error('nope')
      }),
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /Beacon Agency/ }))
    await expect(canvas.getByText('Choose an organization')).toBeInTheDocument()
  },
}

export const RedirectsToLoginWithoutUser: Story = {
  parameters: { auth: auth({ user: null }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('login page')).toBeInTheDocument()
  },
}

export const RedirectsHomeWhenOrgAlreadyActive: Story = {
  parameters: { auth: auth({ org: acme, role: 'admin' }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('home page')).toBeInTheDocument()
  },
}

// The backend binds a single-membership user at login, so the picker has
// nothing to ask and the page bounces straight to /home.
export const RedirectsHomeWithOneMembership: Story = {
  parameters: { auth: auth({ memberships: [memberships[0]] }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('home page')).toBeInTheDocument()
  },
}

// While /auth/me is in flight the page renders nothing rather than flashing
// the picker at a user who may already have an org.
export const LoadingRendersNothing: Story = {
  parameters: { auth: auth({ loading: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Choose an organization')).not.toBeInTheDocument()
    await expect(canvas.queryByText('home page')).not.toBeInTheDocument()
  },
}
