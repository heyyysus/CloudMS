import type { Meta, StoryObj } from '@storybook/react-vite'
import { MemoryRouter, Route, Routes } from 'react-router'
import { expect, within } from 'storybook/test'
import { RequirePlatformOwner } from './RequirePlatformOwner'
import { AuthContext, type AuthContextValue } from './auth-context'
import type { User } from '@/api/auth'

const owner: User = {
  id: 'usr-1',
  email: 'owner@cloudms.dev',
  name: 'Platform Owner',
  isPlatformOwner: true,
}

const staff: User = {
  id: 'usr-2',
  email: 'staff@acme.test',
  name: 'Staff Member',
  isPlatformOwner: false,
}

function auth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    user: owner,
    org: null,
    memberships: [],
    role: null,
    loading: false,
    setMe: () => {},
    setOrg: async () => {},
    ...overrides,
  }
}

// RequirePlatformOwner only reads auth from context, so each story fixes a
// context value and observes which stand-in route rendered, the way
// SelectOrg.stories.tsx exercises its own redirects.
const meta = {
  title: 'auth/RequirePlatformOwner',
  component: RequirePlatformOwner,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story, { parameters }) => (
      <AuthContext.Provider value={(parameters.auth as AuthContextValue) ?? auth()}>
        <MemoryRouter initialEntries={['/platform']}>
          <Routes>
            <Route element={<Story />}>
              <Route path="/platform" element={<p>platform page</p>} />
            </Route>
            <Route path="/login" element={<p>login page</p>} />
            <Route path="/home" element={<p>home page</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    ),
  ],
} satisfies Meta<typeof RequirePlatformOwner>

export default meta
type Story = StoryObj<typeof meta>

export const RendersForAPlatformOwner: Story = {
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('platform page')).toBeInTheDocument()
  },
}

export const RedirectsHomeForNonOwner: Story = {
  parameters: { auth: auth({ user: staff }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('home page')).toBeInTheDocument()
  },
}

export const RedirectsToLoginWithoutUser: Story = {
  parameters: { auth: auth({ user: null }) },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('login page')).toBeInTheDocument()
  },
}

export const LoadingRendersSpinner: Story = {
  parameters: { auth: auth({ loading: true }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('platform page')).not.toBeInTheDocument()
    await expect(canvas.queryByText('home page')).not.toBeInTheDocument()
  },
}
