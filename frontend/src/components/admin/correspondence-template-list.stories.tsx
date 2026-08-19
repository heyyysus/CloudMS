import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { ManageCorrespondenceTemplatesCard } from './correspondence-template-list'
import type {
  CorrespondenceTemplate,
  CorrespondenceTemplatesResponse,
} from '@/api/correspondenceTemplates'
import { ApiError } from '@/api/client'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const MERGE_FIELDS = [
  'clientFirstName',
  'clientFullName',
  'clientEmail',
  'policyNumber',
  'carrierName',
  'agentName',
  'agentEmail',
]

const templates: CorrespondenceTemplate[] = [
  {
    id: 3,
    key: 'correspondence-renewal-reminder-ab12cd34',
    name: 'Renewal Reminder',
    subject: 'Your policy {{policyNumber}} is renewing',
    body: 'Hi {{clientFullName}}, your {{carrierName}} policy renews soon.\n\n- {{agentName}}',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 4,
    key: 'correspondence-payment-received-ff99aa00',
    name: 'Payment Received',
    subject: 'We received your payment',
    body: 'Thanks {{clientFirstName}}!',
    updatedAt: '2026-08-10T00:00:00.000Z',
  },
]

const response: CorrespondenceTemplatesResponse = { templates, mergeFields: MERGE_FIELDS }

const meta = {
  title: 'admin/ManageCorrespondenceTemplatesCard',
  component: ManageCorrespondenceTemplatesCard,
  tags: ['autodocs'],
  args: {
    getCorrespondenceTemplatesFn: fn(async () => response),
    createCorrespondenceTemplateFn: fn(async () => templates[0]),
    updateCorrespondenceTemplateFn: fn(async (id: number) => templates.find((t) => t.id === id)!),
    deleteCorrespondenceTemplateFn: fn(async () => undefined),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof ManageCorrespondenceTemplatesCard>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Renewal Reminder')).toBeInTheDocument()
    await expect(
      canvas.getByText(/Your policy \{\{policyNumber\}\} is renewing/)
    ).toBeInTheDocument()
    await expect(canvas.getByText('Payment Received')).toBeInTheDocument()
  },
}

export const AddOpensTheDialog: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Renewal Reminder')

    await userEvent.click(canvas.getByRole('button', { name: /new template/i }))

    const dialog = await screen.findByRole('dialog')
    await expect(dialog).toHaveTextContent('New correspondence template')
    await expect(screen.getByLabelText('Template name')).toHaveValue('')
  },
}

export const CreatesATemplate: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Renewal Reminder')

    await userEvent.click(canvas.getByRole('button', { name: /new template/i }))
    await screen.findByRole('dialog')

    await userEvent.type(screen.getByLabelText('Template name'), 'Welcome Packet')
    await userEvent.type(screen.getByLabelText('Subject'), 'Welcome aboard')
    await userEvent.type(screen.getByLabelText('Body'), 'Glad to have you.')

    await userEvent.click(screen.getByRole('button', { name: /create template/i }))

    // createFn is the mutationFn, so react-query passes a context object as a
    // second argument.
    await expect(args.createCorrespondenceTemplateFn).toHaveBeenCalledWith(
      { name: 'Welcome Packet', subject: 'Welcome aboard', body: 'Glad to have you.' },
      expect.anything()
    )
  },
}

export const EditOpensWithValues: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Renewal Reminder')

    await userEvent.click(canvas.getByRole('button', { name: /actions for renewal reminder/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }))

    const dialog = await screen.findByRole('dialog')
    await expect(dialog).toHaveTextContent('Edit template')
    await expect(screen.getByLabelText('Template name')).toHaveValue('Renewal Reminder')
  },
}

export const DeletesATemplate: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByText('Renewal Reminder')

    await userEvent.click(canvas.getByRole('button', { name: /actions for renewal reminder/i }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))

    const dialog = await screen.findByRole('dialog')
    await expect(dialog).toHaveTextContent('Delete “Renewal Reminder”?')

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await expect(args.deleteCorrespondenceTemplateFn).toHaveBeenCalledWith(3)
  },
}

export const Loading: Story = {
  args: {
    getCorrespondenceTemplatesFn: fn(
      () => new Promise<CorrespondenceTemplatesResponse>(() => {})
    ),
  },
}

export const LoadError: Story = {
  args: {
    getCorrespondenceTemplatesFn: fn(async () => {
      throw new ApiError(500, 'Server error')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText(/failed to load templates/i)).toBeInTheDocument()
  },
}

export const Empty: Story = {
  args: {
    getCorrespondenceTemplatesFn: fn(async () => ({ templates: [], mergeFields: MERGE_FIELDS })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('No templates yet.')).toBeInTheDocument()
  },
}
