// Shared chrome for the per-policy record lists (Logs, Attachments,
// Accounting) so the subtabs read as one component. Each card still owns its
// own column template; only the container/header/row treatment is shared.
export const RECORD_LIST_CONTAINER = 'max-h-96 overflow-y-auto rounded-md border bg-background text-sm'
export const RECORD_LIST_HEADER =
  'sticky top-0 z-10 border-b bg-background py-1.5 text-xs font-semibold text-muted-foreground'
export const RECORD_LIST_ROW =
  'w-full py-1 text-left odd:bg-muted-foreground/15 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none'
