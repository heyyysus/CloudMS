import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { formatFileSize } from '@/lib/format-file-size'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { cn } from '@/lib/utils'
import {
  getPolicyAttachmentLink,
  getPolicyAttachments,
  type PolicyAttachment,
} from '@/api/policyAttachments'

interface PolicyAttachmentsProps {
  policyId: number
  onAddAttachment: () => void
  currentUserId?: number
  getPolicyAttachmentsFn?: typeof getPolicyAttachments
  getPolicyAttachmentLinkFn?: typeof getPolicyAttachmentLink
}

const ATTACHMENT_GRID = 'grid grid-cols-[minmax(0,1fr)_6rem_11rem_2.75rem] items-center gap-x-3 px-2'

export function PolicyAttachments({
  policyId,
  onAddAttachment,
  currentUserId,
  getPolicyAttachmentsFn = getPolicyAttachments,
  getPolicyAttachmentLinkFn = getPolicyAttachmentLink,
}: PolicyAttachmentsProps) {
  const [openingId, setOpeningId] = useState<number | null>(null)

  const { data: attachments, isPending, isError } = useQuery({
    queryKey: ['policyAttachments', policyId],
    queryFn: ({ signal }) => getPolicyAttachmentsFn(policyId, signal),
  })

  async function openAttachment(attachment: PolicyAttachment) {
    if (openingId !== null) return
    setOpeningId(attachment.id)
    try {
      const { url } = await getPolicyAttachmentLinkFn(attachment.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attachments</CardTitle>
        <CardAction>
          <Button type="button" variant="outline" size="sm" onClick={onAddAttachment}>
            Add attachment
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isError && <p className="text-sm text-destructive">Failed to load attachments.</p>}
        {isPending && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
        {!isPending && !isError && attachments && attachments.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No attachments yet. Drop a file anywhere on this page, or use "Add attachment".
          </p>
        )}
        {!isPending && !isError && attachments && attachments.length > 0 && (
          <div className="max-h-96 overflow-y-auto rounded-md border bg-background text-sm">
            <div
              className={cn(
                ATTACHMENT_GRID,
                'sticky top-0 z-10 border-b bg-background py-1.5 text-xs font-semibold text-muted-foreground'
              )}
            >
              <span>File</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span>By</span>
            </div>
            {attachments.map((attachment) => (
              <button
                key={attachment.id}
                type="button"
                onDoubleClick={() => openAttachment(attachment)}
                disabled={openingId === attachment.id}
                aria-label={`Open ${attachment.fileName}`}
                title="Double-click to open"
                className={cn(
                  ATTACHMENT_GRID,
                  'w-full cursor-default py-1 text-left odd:bg-muted-foreground/15 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none disabled:opacity-60'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-foreground">
                    {openingId === attachment.id ? 'Opening…' : attachment.fileName}
                  </span>
                  {attachment.description && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {attachment.description}
                    </span>
                  )}
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {formatFileSize(attachment.sizeBytes)}
                </span>
                <span className="whitespace-nowrap text-muted-foreground">
                  {formatLogTimestamp(attachment.createdAt)}
                </span>
                <LogAuthorChip
                  author={attachment.uploadedBy}
                  isCurrentUser={attachment.uploadedBy.id === currentUserId}
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
