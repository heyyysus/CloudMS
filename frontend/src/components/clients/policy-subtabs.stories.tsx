import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { PolicySubtabs, type PolicySubtabValue } from './policy-subtabs'
import { PolicyTabs } from './policy-tabs'
import type { AutoPolicy } from '@/api/clients'

function StatefulPolicySubtabs({
  initialValue,
  onValueChange,
}: {
  initialValue: PolicySubtabValue
  onValueChange?: (value: PolicySubtabValue) => void
}) {
  const [value, setValue] = useState(initialValue)
  return (
    <PolicySubtabs
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange?.(next)
      }}
      details={<p className="text-sm">Policy details content.</p>}
      accounting={<p className="text-sm">Accounting content.</p>}
      logs={<p className="text-sm">Logs content.</p>}
    />
  )
}

const meta = {
  title: 'clients/PolicySubtabs',
  component: StatefulPolicySubtabs,
  tags: ['autodocs'],
  args: {
    initialValue: 'details',
    onValueChange: fn(),
  },
} satisfies Meta<typeof StatefulPolicySubtabs>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultShowsDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tabs = canvas.getAllByRole('tab')
    await expect(tabs.map((tab) => tab.textContent)).toEqual([
      'Policy Details',
      'Logs',
      'Accounting',
    ])
    const detailsTab = canvas.getByRole('tab', { name: 'Policy Details' })
    await expect(detailsTab).toHaveAttribute('aria-selected', 'true')
    await expect(detailsTab).toHaveAttribute('data-state', 'active')
    await expect(canvas.getByText('Policy details content.')).toBeInTheDocument()
  },
}

export const SwitchToAccounting: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('tab', { name: 'Accounting' }))
    await expect(canvas.getByRole('tab', { name: 'Accounting' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(canvas.getByText('Accounting content.')).toBeInTheDocument()
    await expect(canvas.queryByText('Policy details content.')).not.toBeInTheDocument()
    await expect(args.onValueChange).toHaveBeenCalledWith('accounting')
  },
}

// Policy id → policy number, mirroring the shape ClientDetail passes to
// PolicyTabs. The subtab lives in the parent, shared across policies, so
// switching policy tabs must not reset it back to Policy Details.
function policyFixture(id: number, policyNumber: string): AutoPolicy {
  return {
    id,
    clientId: 155,
    carrierId: 140,
    policyNumber,
    policyAddress1: null,
    policyAddress2: null,
    policyCity: null,
    policyState: null,
    policyZip: null,
    effectiveDate: '2026-01-01',
    expirationDate: '2099-01-01',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

const policies: AutoPolicy[] = [
  policyFixture(10, 'POL-OLDEST'),
  policyFixture(20, 'POL-NEWEST'),
]

function SharedSubtabAcrossPolicies() {
  const [policyId, setPolicyId] = useState(20)
  const [subtab, setSubtab] = useState<PolicySubtabValue>('details')
  return (
    <PolicyTabs policies={policies} selectedId={policyId} onSelect={setPolicyId}>
      {(policy) => (
        <PolicySubtabs
          value={subtab}
          onValueChange={setSubtab}
          details={<p className="text-sm">Details for {policy.policyNumber}</p>}
          accounting={<p className="text-sm">Accounting for {policy.policyNumber}</p>}
          logs={<p className="text-sm">Logs for {policy.policyNumber}</p>}
        />
      )}
    </PolicyTabs>
  )
}

export const RemembersSubtabAcrossPolicySwitch: StoryObj = {
  render: () => <SharedSubtabAcrossPolicies />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Select Logs on the newest policy tab (AUTOP-2).
    await userEvent.click(canvas.getByRole('tab', { name: 'Logs' }))
    await expect(canvas.getByText('Logs for POL-NEWEST')).toBeInTheDocument()

    // Switch to the older policy tab — the Logs subtab should stay selected.
    await userEvent.click(canvas.getByRole('tab', { name: /AUTOP-1/ }))
    await expect(canvas.getByRole('tab', { name: 'Logs' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
    await expect(canvas.getByText('Logs for POL-OLDEST')).toBeInTheDocument()
  },
}
