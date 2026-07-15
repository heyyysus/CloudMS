import type { ReactNode } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { AutoPolicy } from '@/api/clients'
import { displayStatus, sortPoliciesByCreatedAt, STATUS_DOT_CLASS } from '@/lib/policy-status'

// Personal auto is the only policy type today. When more types exist, this
// becomes a map keyed by a policy `type` field.
const POLICY_TAB_PREFIX = 'AUTOP'

interface PolicyTabsProps {
  policies: AutoPolicy[]
  selectedId: number
  onSelect: (policyId: number) => void
  // Rendered at the right end of the tab row (e.g. the Add Policy dialog trigger).
  action?: ReactNode
  children: (policy: AutoPolicy) => ReactNode
}

export function PolicyTabs({ policies, selectedId, onSelect, action, children }: PolicyTabsProps) {
  const sorted = sortPoliciesByCreatedAt(policies)

  return (
    <Tabs
      value={String(selectedId)}
      onValueChange={(value) => onSelect(Number(value))}
      className="gap-3"
    >
      <div className="flex items-end justify-between gap-2 border-b">
        <TabsList className="h-auto justify-start gap-1 overflow-x-auto rounded-none bg-transparent p-0">
          {sorted.map((policy, index) => {
            const status = displayStatus(policy)
            return (
              <TabsTrigger
                key={policy.id}
                value={String(policy.id)}
                className={cn(
                  '-mb-px rounded-b-none rounded-t-md border border-b-0 border-transparent bg-transparent px-3 py-1.5 shadow-none',
                  'data-active:border-border data-active:bg-background data-active:shadow-none',
                  status !== 'active' && 'text-muted-foreground data-active:text-muted-foreground'
                )}
              >
                <span aria-hidden className={cn('size-2 rounded-full', STATUS_DOT_CLASS[status])} />
                {POLICY_TAB_PREFIX}-{index + 1}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {action && <div className="pb-1.5">{action}</div>}
      </div>
      {sorted.map((policy) => (
        <TabsContent key={policy.id} value={String(policy.id)}>
          {children(policy)}
        </TabsContent>
      ))}
    </Tabs>
  )
}
