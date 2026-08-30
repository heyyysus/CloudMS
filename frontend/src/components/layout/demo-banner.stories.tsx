import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { DemoBanner } from './demo-banner'

const meta = {
  title: 'layout/DemoBanner',
  component: DemoBanner,
  tags: ['autodocs'],
  args: { demoMode: true },
} satisfies Meta<typeof DemoBanner>

export default meta
type Story = StoryObj<typeof meta>

export const WithInterval: Story = {
  args: { resetMinutes: 15 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent(
      'Demo — all data is fake and resets every 15 minutes.'
    )
  },
}

export const WithoutInterval: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('status')).toHaveTextContent('resets periodically')
  },
}

export const NotDemo: Story = {
  args: { demoMode: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('status')).not.toBeInTheDocument()
  },
}
