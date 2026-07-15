import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PolicyTabs } from './policy-tabs'
import { PolicyCard } from './policy-card'
import { Button } from '@/components/ui/button'
import type { AutoPolicy } from '@/api/clients'

function policyFixture(overrides: Partial<AutoPolicy>): AutoPolicy {
  return {
    id: 1,
    clientId: 155,
    carrierId: 140,
    policyNumber: 'POL-000001',
    policyAddress: null,
    effectiveDate: '2026-01-01',
    expirationDate: '2099-01-01',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// Deliberately out of creation order to prove PolicyTabs sorts internally
// (oldest → AUTOP-1). Expirations are far-future except the derived-expired
// one, so the stories never rot as real time passes.
const policies: AutoPolicy[] = [
  policyFixture({
    id: 30,
    policyNumber: 'POL-NEWEST',
    status: 'active',
    createdAt: '2026-03-01T00:00:00.000Z',
  }),
  policyFixture({
    id: 10,
    policyNumber: 'POL-OLDEST',
    status: 'cancelled',
    createdAt: '2026-01-01T00:00:00.000Z',
  }),
  policyFixture({
    id: 20,
    policyNumber: 'POL-MIDDLE',
    status: 'pending',
    createdAt: '2026-02-01T00:00:00.000Z',
  }),
]

// Stored active but long past its expiration date → displays as expired.
const dateExpiredPolicies: AutoPolicy[] = [
  ...policies,
  policyFixture({
    id: 40,
    policyNumber: 'POL-DATE-EXPIRED',
    status: 'active',
    expirationDate: '2020-01-01',
    createdAt: '2026-04-01T00:00:00.000Z',
  }),
]

function StatefulPolicyTabs({
  policies,
  initialSelectedId,
  onSelect,
}: {
  policies: AutoPolicy[]
  initialSelectedId: number
  onSelect?: (policyId: number) => void
}) {
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  return (
    <PolicyTabs
      policies={policies}
      selectedId={selectedId}
      onSelect={(id) => {
        setSelectedId(id)
        onSelect?.(id)
      }}
      action={<Button size="sm">Add Policy</Button>}
    >
      {(policy) => <PolicyCard policy={policy} />}
    </PolicyTabs>
  )
}

const meta = {
  title: 'clients/PolicyTabs',
  component: StatefulPolicyTabs,
  tags: ['autodocs'],
  args: {
    policies,
    initialSelectedId: 30,
    onSelect: fn(),
  },
} satisfies Meta<typeof StatefulPolicyTabs>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultSelectsNewest: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tabs = canvas.getAllByRole('tab')
    await expect(tabs.map((tab) => tab.textContent)).toEqual(['AUTOP-1', 'AUTOP-2', 'AUTOP-3'])
    await expect(tabs[2]).toHaveAttribute('aria-selected', 'true')
    await expect(canvas.getByText('POL-NEWEST')).toBeInTheDocument()
  },
}

export const SelectOlderTab: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: /AUTOP-1/ }))
    await expect(canvas.getByRole('tab', { name: /AUTOP-1/ })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(canvas.getByText('POL-OLDEST')).toBeInTheDocument()
    await expect(args.onSelect).toHaveBeenCalledWith(10)
  },
}

export const DerivedExpired: Story = {
  args: {
    policies: dateExpiredPolicies,
    initialSelectedId: 40,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // The card shows the derived status despite the stored 'active'.
    await expect(canvas.getByText('expired')).toBeInTheDocument()
    // The tab's status dot is gray (muted) for the derived-expired policy.
    const expiredTab = canvas.getByRole('tab', { name: /AUTOP-4/ })
    await expect(expiredTab.querySelector('[aria-hidden]')).toHaveClass('bg-muted-foreground')
  },
}
