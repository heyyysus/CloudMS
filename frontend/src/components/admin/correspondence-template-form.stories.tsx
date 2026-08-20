import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { CorrespondenceTemplateForm } from './correspondence-template-form'
import type { CorrespondenceTemplate } from '@/api/correspondenceTemplates'

const MERGE_FIELDS = [
  'clientFirstName',
  'clientFullName',
  'clientEmail',
  'policyNumber',
  'carrierName',
  'agentName',
  'agentEmail',
]

const initial: CorrespondenceTemplate = {
  id: 3,
  key: 'correspondence-renewal-reminder-ab12cd34',
  name: 'Renewal Reminder',
  subject: 'Policy {{policyNumber}} renews soon',
  body: 'Hi {{clientFullName}},\n\nYour {{carrierName}} policy renews soon.\n\n- {{agentName}}',
  updatedAt: '2026-08-01T00:00:00.000Z',
}

const meta = {
  title: 'admin/CorrespondenceTemplateForm',
  component: CorrespondenceTemplateForm,
  tags: ['autodocs'],
  args: {
    mergeFields: MERGE_FIELDS,
    submitLabel: 'Save',
    pendingLabel: 'Saving…',
    onSubmit: fn(),
    onCancel: fn(),
  },
} satisfies Meta<typeof CorrespondenceTemplateForm>

export default meta
type Story = StoryObj<typeof meta>

// The preview substitutes the built-in sample values for merge tokens.
export const RendersPreviewWithSampleData: Story = {
  args: { initial },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Subject and body previews use samples: policyNumber → POL-100482,
    // clientFullName → Jane A. Doe, carrierName → Progressive.
    await expect(await canvas.findByText('Policy POL-100482 renews soon')).toBeInTheDocument()
    await expect(
      canvas.getByText(/Hi Jane A\. Doe,/, { collapseWhitespace: false })
    ).toBeInTheDocument()
    await expect(canvas.getByText(/Your Progressive policy renews soon\./)).toBeInTheDocument()
  },
}

// A passed-in agent overrides the sample agent values in the preview.
export const PreviewUsesAgentOverride: Story = {
  args: {
    initial,
    previewAgent: { name: 'Dana Broker', email: 'dana@agency.example' },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/- Dana Broker/)).toBeInTheDocument()
  },
}

// Clicking a merge-field chip inserts its token into the body.
export const InsertsMergeFieldChip: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const body = canvas.getByLabelText('Body') as HTMLTextAreaElement
    await expect(body).toHaveValue('')

    await userEvent.click(canvas.getByRole('button', { name: '{{clientFullName}}' }))

    await expect(body.value).toContain('{{clientFullName}}')
  },
}

export const Submits: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)

    await userEvent.type(canvas.getByLabelText('Template name'), 'Thanks Note')
    await userEvent.type(canvas.getByLabelText('Subject'), 'Thank you')
    await userEvent.type(canvas.getByLabelText('Body'), 'Appreciate your business.')

    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))

    await expect(args.onSubmit).toHaveBeenCalledWith({
      name: 'Thanks Note',
      subject: 'Thank you',
      body: 'Appreciate your business.',
    })
  },
}
