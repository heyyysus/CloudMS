import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttachmentPreviewDialog } from '@/components/clients/attachment-preview-dialog'
import { LinkAttachmentsToLogDialog } from '@/components/clients/link-attachments-to-log-dialog'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { RECORD_LIST_CONTAINER, RECORD_LIST_HEADER, RECORD_LIST_ROW } from '@/components/clients/record-list'
import { attachmentIcon, stripFileExtension } from '@/lib/file-display'
import { formatFileSize } from '@/lib/format-file-size'
import { formatLogTimestamp } from '@/lib/log-datetime'
import { cn } from '@/lib/utils'
import {
  getPolicyAttachmentLink,
  getPolicyAttachments,
  type PolicyAttachment,
} from '@/api/policyAttachments'
import { linkAttachmentsToLog } from '@/api/policyLogAttachments'
import { getPolicyLogs } from '@/api/policyLogs'

interface PolicyAttachmentsProps {
  policyId: number
  onAddAttachment: () => void
  currentUserId?: number
  getPolicyAttachmentsFn?: typeof getPolicyAttachments
  getPolicyAttachmentLinkFn?: typeof getPolicyAttachmentLink
  getPolicyLogsFn?: typeof getPolicyLogs
  linkAttachmentsToLogFn?: typeof linkAttachmentsToLog
  // Opens the card already in selection mode; only used by stories.
  initialSelecting?: boolean
}

// Leading fixed column holds the file-type icon; the extension is stripped
// from the name, so the icon is what conveys the type.
const ATTACHMENT_GRID =
  'grid grid-cols-[1.25rem_minmax(0,1fr)_6rem_11rem_2.75rem] items-center gap-x-3 px-2'

// Same columns with a checkbox prepended, so switching modes shifts the rows
// and the header together rather than letting them drift apart.
const ATTACHMENT_GRID_SELECTING =
  'grid grid-cols-[1rem_1.25rem_minmax(0,1fr)_6rem_11rem_2.75rem] items-center gap-x-3 px-2'

// Presentational, not a Radix Checkbox: the row itself is the button, and
// nesting a second interactive element inside it would be invalid. The row
// carries aria-pressed, so this only has to look like a checkbox.
function SelectionBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-4 items-center justify-center rounded-sm border',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'
      )}
    >
      {checked && <CheckIcon className="size-3" strokeWidth={3} />}
    </span>
  )
}

export function PolicyAttachments({
  policyId,
  onAddAttachment,
  currentUserId,
  getPolicyAttachmentsFn = getPolicyAttachments,
  getPolicyAttachmentLinkFn = getPolicyAttachmentLink,
  getPolicyLogsFn = getPolicyLogs,
  linkAttachmentsToLogFn = linkAttachmentsToLog,
  initialSelecting = false,
}: PolicyAttachmentsProps) {
  const [selected, setSelected] = useState<PolicyAttachment | null>(null)
  // null means "not selecting" - distinct from an empty set, which is
  // selection mode with nothing picked yet.
  const [selectedIds, setSelectedIds] = useState<Set<number> | null>(
    initialSelecting ? new Set() : null
  )
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  const { data: attachments, isPending, isError } = useQuery({
    queryKey: ['policyAttachments', policyId],
    queryFn: ({ signal }) => getPolicyAttachmentsFn(policyId, signal),
  })

  const selecting = selectedIds !== null
  const selectedAttachments = attachments?.filter((a) => selectedIds?.has(a.id)) ?? []

  function toggle(id: number) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attachments</CardTitle>
        <CardAction className="flex items-center gap-2">
          {selecting ? (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} selected
              </span>
              {/* Link is the first bulk action; further ones slot in here. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={selectedIds.size === 0}
                onClick={() => setLinkDialogOpen(true)}
              >
                Link to log
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(null)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!attachments || attachments.length === 0}
                onClick={() => setSelectedIds(new Set())}
              >
                Select
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onAddAttachment}>
                Add attachment
              </Button>
            </>
          )}
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
          <div className={RECORD_LIST_CONTAINER}>
            <div className={cn(selecting ? ATTACHMENT_GRID_SELECTING : ATTACHMENT_GRID, RECORD_LIST_HEADER)}>
              {selecting && <span aria-hidden="true" />}
              <span aria-hidden="true" />
              <span>File</span>
              <span>Size</span>
              <span>Uploaded</span>
              <span>By</span>
            </div>
            {attachments.map((attachment) => {
              const Icon = attachmentIcon(attachment.mimeType)
              const displayName = stripFileExtension(attachment.fileName)
              const isSelected = selectedIds?.has(attachment.id) ?? false
              return (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() =>
                    selecting ? toggle(attachment.id) : setSelected(attachment)
                  }
                  aria-pressed={selecting ? isSelected : undefined}
                  aria-label={
                    selecting ? `Select ${displayName}` : `Preview ${displayName}`
                  }
                  title={selecting ? 'Select' : 'Preview'}
                  className={cn(
                    selecting ? ATTACHMENT_GRID_SELECTING : ATTACHMENT_GRID,
                    RECORD_LIST_ROW,
                    'cursor-pointer',
                    isSelected && 'bg-primary/10',
                    // Only admins ever receive voided rows.
                    attachment.isVoided && 'opacity-60'
                  )}
                >
                  {selecting && <SelectionBox checked={isSelected} />}
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
      <LinkAttachmentsToLogDialog
        policyId={policyId}
        attachments={selectedAttachments}
        currentUserId={currentUserId}
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        // Selection has served its purpose once the link lands, so the card
        // drops back to its normal state rather than leaving rows ticked.
        onLinked={() => setSelectedIds(null)}
        getPolicyLogsFn={getPolicyLogsFn}
        linkAttachmentsToLogFn={linkAttachmentsToLogFn}
      />
    </Card>
  )
}
