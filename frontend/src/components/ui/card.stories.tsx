import type { Meta, StoryObj } from '@storybook/react-vite'
import { Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './card'

const meta = {
  title: 'ui/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const EmptyState: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4 text-muted-foreground" />
          Clients
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">No clients yet — coming soon.</p>
      </CardContent>
    </Card>
  ),
}
