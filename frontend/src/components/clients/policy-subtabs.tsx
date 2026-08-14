import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export type PolicySubtabValue = 'details' | 'accounting' | 'logs' | 'attachments'

const SUBTABS: { value: PolicySubtabValue; label: string }[] = [
  { value: 'details', label: 'Policy Details' },
  { value: 'logs', label: 'Logs' },
  { value: 'attachments', label: 'Attachments' },
  { value: 'accounting', label: 'Accounting' },
]

interface PolicySubtabsProps {
  value: PolicySubtabValue
  onValueChange: (value: PolicySubtabValue) => void
  details: ReactNode
  accounting: ReactNode
  logs: ReactNode
  attachments: ReactNode
}

export function PolicySubtabs({
  value,
  onValueChange,
  details,
  accounting,
  logs,
  attachments,
}: PolicySubtabsProps) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onValueChange(next as PolicySubtabValue)}
      className="gap-3"
    >
      <TabsList className="h-auto justify-start gap-2 rounded-none bg-transparent p-0">
        {SUBTABS.map((subtab) => (
          <TabsTrigger
            key={subtab.value}
            value={subtab.value}
            className={cn(
              'rounded-sm border bg-transparent px-3 py-1.5 text-muted-foreground shadow-none',
              'hover:text-foreground',
              'data-active:border-primary data-active:bg-primary data-active:text-primary-foreground data-active:shadow-none'
            )}
          >
            {subtab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="details">{details}</TabsContent>
      <TabsContent value="logs">{logs}</TabsContent>
      <TabsContent value="attachments">{attachments}</TabsContent>
      <TabsContent value="accounting">{accounting}</TabsContent>
    </Tabs>
  )
}
