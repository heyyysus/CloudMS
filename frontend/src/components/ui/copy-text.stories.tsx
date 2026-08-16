import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { CopyText } from './copy-text'

const meta = {
  title: 'ui/CopyText',
  component: CopyText,
  tags: ['autodocs'],
  args: {
    value: '(555) 123-4567',
  },
} satisfies Meta<typeof CopyText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithSeparateCopyValue: Story = {
  args: {
    value: '(555) 123-4567',
    copyValue: '5551234567',
    label: 'phone number',
  },
}

export const CopiesOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = canvas.getByRole('button')
    // The headless test browser has no clipboard permission granted, so
    // navigator.clipboard.writeText rejects; stub it to exercise the
    // component's copy flow without depending on that permission.
    const originalWriteText = navigator.clipboard.writeText
    navigator.clipboard.writeText = async () => {}
    try {
      // The value text must never change - a toast signals the copy, so
      // readability is unaffected.
      await expect(button).toHaveTextContent('(555) 123-4567')
      await userEvent.click(button)
      await waitFor(() =>
        expect(within(document.body).getByText('Copied to Clipboard')).toBeInTheDocument()
      )
      await expect(button).toHaveTextContent('(555) 123-4567')
    } finally {
      navigator.clipboard.writeText = originalWriteText
    }
  },
}
