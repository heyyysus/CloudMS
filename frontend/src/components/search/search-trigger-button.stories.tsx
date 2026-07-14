import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { SearchTriggerButton } from './search-trigger-button'

const meta = {
  title: 'search/SearchTriggerButton',
  component: SearchTriggerButton,
  tags: ['autodocs'],
  args: {
    onClick: fn(),
  },
} satisfies Meta<typeof SearchTriggerButton>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
