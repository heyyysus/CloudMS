import type { Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, fn, screen, userEvent, within } from 'storybook/test'
import { WelcomeTemplateEditor } from './welcome-template-editor'
import { ApiError } from '@/api/client'
import type { EmailTemplateResponse } from '@/api/emailTemplates'

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

const seededTemplate: EmailTemplateResponse = {
  template: {
    key: 'welcome',
    subject: 'Welcome to CloudMS, {{name}}',
    body: 'Hi {{name}}, {{inviterName}} invited you. Sign in at {{appUrl}}.',
    updatedAt: '2026-08-14T00:00:00.000Z',
  },
  mergeFields: ['name', 'email', 'role', 'appUrl', 'inviterName'],
}

const meta = {
  title: 'admin/WelcomeTemplateEditor',
  component: WelcomeTemplateEditor,
  tags: ['autodocs'],
  args: {
    getEmailTemplateFn: fn(async () => seededTemplate),
    updateEmailTemplateFn: fn(async (_key, body) => ({
      template: { ...seededTemplate.template, ...body },
      mergeFields: seededTemplate.mergeFields,
    })),
  },
  decorators: [
    (Story) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
} satisfies Meta<typeof WelcomeTemplateEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Loaded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByDisplayValue(seededTemplate.template.subject)).toBeInTheDocument()
    await expect(canvas.getByText('{{appUrl}}')).toBeInTheDocument()
  },
}

export const InsertsMergeFieldOnChipClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByDisplayValue(seededTemplate.template.subject)

    const body = canvas.getByLabelText(/^body$/i) as HTMLTextAreaElement
    body.focus()
    body.setSelectionRange(body.value.length, body.value.length)
    await userEvent.click(canvas.getByRole('button', { name: '{{role}}' }))

    await expect(body.value.endsWith('{{role}}')).toBe(true)
  },
}

export const SavesEdits: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await canvas.findByDisplayValue(seededTemplate.template.subject)

    const subject = canvas.getByLabelText(/^subject$/i)
    await userEvent.clear(subject)
    // userEvent.type treats "{" as a special-key opener, so a literal "{"
    // has to be escaped by doubling it; "}" needs no escaping.
    await userEvent.type(subject, 'Hi {{{{name}}!')
    await userEvent.click(canvas.getByRole('button', { name: /save template/i }))

    await expect(args.updateEmailTemplateFn).toHaveBeenCalledWith(
      'welcome',
      expect.objectContaining({ subject: 'Hi {{name}}!' })
    )
    await expect(await screen.findByText(/^saved\.$/i)).toBeInTheDocument()
  },
}

export const ServerRejectsUnknownField: Story = {
  args: {
    updateEmailTemplateFn: fn(async (_key: string, _body: { subject: string; body: string }) => {
      throw new ApiError(400, 'Unknown merge fields: {{bogus}}')
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByDisplayValue(seededTemplate.template.subject)

    await userEvent.click(canvas.getByRole('button', { name: /save template/i }))

    // The same message renders in both the inline alert and an error toast,
    // so scope to the alert role to avoid a multiple-match on the text alone.
    await expect(await screen.findByRole('alert')).toHaveTextContent(
      /unknown merge fields: \{\{bogus\}\}/i
    )
  },
}
