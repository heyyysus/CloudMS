import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttachmentPreviewDialog } from '@/components/clients/attachment-preview-dialog'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { attachmentIcon, stripFileExtension } from '@/lib/file-display'
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

// Leading fixed column holds the file-type icon; the extension is stripped
// from the name, so the icon is what conveys the type.
const ATTACHMENT_GRID =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_6rem_11rem_2.75rem] items-center gap-x-3 px-2'

export function PolicyAttachments({
  policyId,
  onAddAttachment,
  currentUserId,
  getPolicyAttachmentsFn = getPolicyAttachments,
  getPolicyAttachmentLinkFn = getPolicyAttachmentLink,
}: PolicyAttachmentsProps) {
  const [selected, setSelected] = useState<PolicyAttachment | null>(null)

  const { data: attachments, isPending, isError } = useQuery({
    queryKey: ['policyAttachments', policyId],
    queryFn: ({ signal }) => getPolicyAttachmentsFn(policyId, signal),
  })

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
              <span aria-hidden="true" />
              <span>File</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span>By</span>
            </div>
            {attachments.map((attachment) => {
              const Icon = attachmentIcon(attachment.mimeType)
              const displayName = stripFileExtension(attachment.fileName)
              return (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => setSelected(attachment)}
                  aria-label={`Preview ${displayName}`}
                  title="Preview"
                  className={cn(
                    ATTACHMENT_GRID,
                    'w-full cursor-pointer py-1 text-left odd:bg-muted-foreground/15 hover:bg-primary/15 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none',
                    // Only admins ever receive voided rows.
                    attachment.isVoided && 'opacity-60'
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">
                      {displayName}
                      {attachment.isVoided && (
                        <span className="ml-1.5 text-xs text-muted-foreground">(Void)</span>
                      )}
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
              )
            })}
          </div>
        )}
      </CardContent>
      <AttachmentPreviewDialog
        attachment={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        getPolicyAttachmentLinkFn={getPolicyAttachmentLinkFn}
      />
    </Card>
  )
}
