import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { ManageReminderRulesCard } from './reminder-rule-list'
import type { CorrespondenceTemplate } from '@/api/correspondenceTemplates'
import type { ReminderRule } from '@/api/reminders'
import { ApiError } from '@/api/client'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

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

const rules: ReminderRule[] = [
  {
    id: 1,
    name: '30-day renewal reminder',
    trigger: 'policy_expiration',
    offsetDays: 30,
    templateId: 3,
    enabled: true,
    updatedAt: '2026-08-01T00:00:00.000Z',
    template: { id: 3, key: templates[0].key, name: 'Renewal Notice', subject: 'x' },
  },
  {
    id: 2,
    name: '7-day final notice',
    trigger: 'policy_expiration',
    offsetDays: 7,
    templateId: 4,
    enabled: false,
    updatedAt: '2026-08-02T00:00:00.000Z',
    template: { id: 4, key: templates[1].key, name: 'Documents Needed', subject: 'y' },
  },
]

const meta = {
  title: 'admin/ManageReminderRulesCard',
  component: ManageReminderRulesCard,
  tags: ['autodocs'],
  args: {
    getReminderRulesFn: fn(async () => ({ rules })),
    getCorrespondenceTemplatesFn: fn(async () => ({ templates, mergeFields: [] })),
    createReminderRuleFn: fn(async () => rules[0]),
    updateReminderRuleFn: fn(async () => ({ ...rules[1], enabled: true })),
    deleteReminderRuleFn: fn(async () => undefined),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ManageReminderRulesCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('30-day renewal reminder')).toBeInTheDocument()
    // The offset is restated in words so a negative value can't be misread.
    await expect(canvas.getByText(/30 days before expiration · Renewal Notice/)).toBeInTheDocument()
    await expect(canvas.getByText('On')).toBeInTheDocument()
    await expect(canvas.getByText('Off')).toBeInTheDocument()
  },
}

export const Loading: Story = {
  args: { getReminderRulesFn: fn(() => new Promise(() => {})) },
}

export const Empty: Story = {
  args: { getReminderRulesFn: fn(async () => ({ rules: [] })) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No rules yet.')).toBeInTheDocument()
  },
}

// A rule sends a template, so with none defined the card points at that
// instead of offering a form with an empty picker.
export const NoTemplatesYet: Story = {
  args: {
    getReminderRulesFn: fn(async () => ({ rules: [] })),
    getCorrespondenceTemplatesFn: fn(async () => ({ templates: [], mergeFields: [] })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText(/Create a correspondence template first/i)
    ).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: /new rule/i })).toBeDisabled()
  },
}

export const LoadError: Story = {
  args: {
    getReminderRulesFn: fn(async () => {
      throw new ApiError(500, 'Internal server error')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Failed to load rules.')).toBeInTheDocument()
  },
}

// The common edit is flipping a rule on or off, so it gets its own control
// rather than living behind the overflow menu.
export const TogglesARule: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('7-day final notice')

    await userEvent.click(canvas.getByRole('button', { name: 'Turn on' }))

    await expect(args.updateReminderRuleFn).toHaveBeenCalledWith(2, { enabled: true })
  },
}

export const CreatesARule: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('30-day renewal reminder')

    await userEvent.click(canvas.getByRole('button', { name: /new rule/i }))
    await screen.findByRole('dialog')

    await userEvent.type(screen.getByLabelText('Name'), '14-day nudge')
    const offset = screen.getByLabelText('Days before expiration')
    await userEvent.clear(offset)
    await userEvent.type(offset, '14')

    await userEvent.click(screen.getByRole('button', { name: /create rule/i }))

    await expect(args.createReminderRuleFn).toHaveBeenCalledWith(
      { name: '14-day nudge', offsetDays: 14, templateId: 3 },
      expect.anything()
    )
  },
}

export const EditOpensWithValues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('30-day renewal reminder')

    await userEvent.click(
      canvas.getByRole('button', { name: /actions for 30-day renewal reminder/i })
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog')
    await expect(dialog).toHaveTextContent('Edit reminder rule')
    await expect(screen.getByLabelText('Name')).toHaveValue('30-day renewal reminder')
    await expect(screen.getByLabelText('Days before expiration')).toHaveValue(30)
  },
}

// Deleting drops queued reminders too, which the copy has to say out loud.
export const DeleteWarnsAboutQueuedReminders: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('30-day renewal reminder')

    await userEvent.click(
      canvas.getByRole('button', { name: /actions for 30-day renewal reminder/i })
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog')
    await expect(dialog).toHaveTextContent('queued but not yet sent are dropped')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await expect(args.deleteReminderRuleFn).toHaveBeenCalledWith(1)
  },
}
