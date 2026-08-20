import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { ReminderRuleForm } from './reminder-rule-form'
import type { CorrespondenceTemplate } from '@/api/correspondenceTemplates'
import type { ReminderRule } from '@/api/reminders'

const templates: CorrespondenceTemplate[] = [
  {
    id: 3,
    key: 'correspondence-renewal-reminder-ab12cd34',
    name: 'Renewal Notice',
    subject: 'Your policy {{policyNumber}} is renewing',
    body: 'Hi {{clientFullName}}.',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 4,
    key: 'correspondence-documents-needed-ff99aa00',
    name: 'Documents Needed',
    subject: 'We need a document',
    body: 'Hi {{clientFirstName}}.',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
]

const existing: ReminderRule = {
  id: 1,
  name: '30-day renewal reminder',
  trigger: 'policy_expiration',
  offsetDays: 30,
  templateId: 4,
  enabled: true,
  updatedAt: '2026-08-01T00:00:00.000Z',
  template: { id: 4, key: templates[1].key, name: 'Documents Needed', subject: 'y' },
}

const meta = {
  title: 'admin/ReminderRuleForm',
  component: ReminderRuleForm,
  tags: ['autodocs'],
  args: {
    templates,
    submitLabel: 'Create rule',
    pendingLabel: 'Creating…',
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof ReminderRuleForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Days before expiration')).toHaveValue(30)
    // The plain-English restatement under the field.
    await expect(canvas.getByText('30 days before expiration')).toBeInTheDocument()
  },
}

// A negative offset chases a policy after it expired, which reads backwards
// from the field label - so the helper text has to say it the other way round.
export const NegativeOffsetReadsAsAfter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const offset = canvas.getByLabelText('Days before expiration')
    await userEvent.clear(offset)
    await userEvent.type(offset, '-7')

    await expect(await canvas.findByText('7 days after expiration')).toBeInTheDocument()
  },
}

export const ZeroOffsetReadsAsOnTheDay: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const offset = canvas.getByLabelText('Days before expiration')
    await userEvent.clear(offset)
    await userEvent.type(offset, '0')

    await expect(await canvas.findByText('On the expiration date')).toBeInTheDocument()
  },
}

// Automated sends have no logged-in agent, so this merge field resolves
// differently than on a manual send - the form says so where it is chosen.
export const WarnsThatAgentNameIsTheAgency: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/renders the agency name/i)).toBeInTheDocument()
  },
}

export const ValidatesRequiredName: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Create rule' }))

    await expect(await canvas.findByText('Name is required')).toBeInTheDocument()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const RejectsAnOutOfRangeOffset: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Name'), 'Way out')
    const offset = canvas.getByLabelText('Days before expiration')
    await userEvent.clear(offset)
    await userEvent.type(offset, '5000')

    await userEvent.click(canvas.getByRole('button', { name: 'Create rule' }))

    await expect(
      await canvas.findByText('At most 730 days before expiration')
    ).toBeInTheDocument()
    await expect(args.onSubmit).not.toHaveBeenCalled()
  },
}

export const SubmitsTheRule: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Name'), '14-day nudge')
    const offset = canvas.getByLabelText('Days before expiration')
    await userEvent.clear(offset)
    await userEvent.type(offset, '14')

    await userEvent.click(canvas.getByRole('button', { name: 'Create rule' }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: '14-day nudge',
      offsetDays: 14,
      templateId: 3,
    })
  },
}

export const PicksADifferentTemplate: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByLabelText('Name'), 'Docs chase')

    await userEvent.click(canvas.getByLabelText('Template'))
    await userEvent.click(await screen.findByRole('option', { name: 'Documents Needed' }))

    // findByRole, not getByRole: Radix marks the rest of the page inert while
    // the Select popover is open, so the form is unreachable until it closes.
    await userEvent.click(await screen.findByRole('button', { name: 'Create rule' }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: 'Docs chase',
      offsetDays: 30,
      templateId: 4,
    })
  },
}

export const EditingPrefillsFromTheRule: Story = {
  args: { initial: existing, submitLabel: 'Save changes', pendingLabel: 'Saving…' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByLabelText('Name')).toHaveValue('30-day renewal reminder')
    await expect(canvas.getByLabelText('Days before expiration')).toHaveValue(30)
    await expect(canvas.getByLabelText('Template')).toHaveTextContent('Documents Needed')
  },
}
