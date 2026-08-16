import type { ComponentProps } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Toast as ToastPrimitive } from 'radix-ui'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { ToastItem } from './toast'

// ToastItem renders itself as a Radix Root, which must be a descendant of a
// Provider (and needs a Viewport to portal into) even outside the app's real
// ToastProvider - this wrapper is the minimal harness for that.
function ToastHarness(props: ComponentProps<typeof ToastItem>) {
  return (
    <ToastPrimitive.Provider>
      <ToastItem {...props} />
      <ToastPrimitive.Viewport className="fixed top-4 left-1/2 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 outline-none" />
    </ToastPrimitive.Provider>
  )
}

const meta = {
  title: 'ui/Toast',
  component: ToastHarness,
  tags: ['autodocs'],
  args: {
    type: 'info',
    message: 'Client saved',
    duration: 2000,
  },
} satisfies Meta<typeof ToastHarness>

export default meta
type Story = StoryObj<typeof meta>

export const Info: Story = {}

export const Success: Story = {
  args: { type: 'success', message: 'Policy updated' },
}

export const UploadFailed: Story = {
  args: { type: 'error', message: 'Upload to storage failed', duration: 4000 },
}

export const LongMessage: Story = {
  args: {
    type: 'error',
    message:
      'The uploaded file exceeds the 10MB size limit — choose a smaller file or compress it before trying again.',
    duration: 4000,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByText(/exceeds the 10MB size limit/)
    // Clamped to 2 lines rather than growing the toast indefinitely.
    await expect(title).toHaveClass('line-clamp-2')
  },
}

export const Stacked: Story = {
  render: () => (
    <ToastPrimitive.Provider>
      <ToastItem type="info" message="Syncing…" duration={2000} />
      <ToastItem type="success" message="Client saved" duration={2000} />
      <ToastItem type="error" message="Upload to storage failed" duration={4000} />
      <ToastPrimitive.Viewport className="fixed top-4 left-1/2 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 outline-none" />
    </ToastPrimitive.Provider>
  ),
}

export const DismissesOnClick: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Client saved')).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }))
    // Radix keeps the toast mounted through its exit animation
    // (data-closed:animate-out, duration-100) before removing it.
    await waitFor(() => expect(canvas.queryByText('Client saved')).not.toBeInTheDocument())
  },
}

export const CarriesDurationOnCountdownBar: Story = {
  args: { duration: 4000 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toast = canvas.getByText('Client saved').closest('[data-slot="toast"]')
    await expect(toast).toHaveStyle({ '--toast-duration': '4000ms' })
  },
}
