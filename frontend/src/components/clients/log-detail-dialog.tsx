import { CheckIcon, CopyIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LogAuthorChip } from '@/components/clients/log-author-chip'
import { useCopyToClipboard } from '@/components/ui/copy-text'
import { attachmentIcon, stripFileExtension } from '@/lib/file-display'
import { formatLogTimestamp } from '@/lib/log-datetime'
import type { PolicyAttachment } from '@/api/policyAttachments'
import type { PolicyLogAttachment } from '@/api/policyLogAttachments'
import type { PolicyLog } from '@/api/policyLogs'

function CopyLogBodyButton({ body }: { body: string }) {
  const { copied, copy } = useCopyToClipboard()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      aria-label="Copy log body"
      onClick={() => copy(body)}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? 'Copied!' : 'Copy'}
    </Button>
  )
}

interface LinkedAttachmentsProps {
  links: PolicyLogAttachment[]
  onPreviewAttachment: (attachment: PolicyAttachment) => void
  onUnlink: (linkId: number) => void
  unlinkingId?: number
}

// Documents filed under this log - either linked by hand from the Attachments
// subtab, or by the server when it generated them for the action this log
// records. The credit is for the link, not the upload, so an invoice PDF
// reads "Linked by" whoever created the invoice.
function LinkedAttachments({
  links,
  onPreviewAttachment,
  onUnlink,
  unlinkingId,
}: LinkedAttachmentsProps) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold text-muted-foreground">Attachments</h3>
      <div className="divide-y rounded-md border bg-background">
        {links.map((link) => {
          const Icon = attachmentIcon(link.attachment.mimeType)
          const displayName = stripFileExtension(link.attachment.fileName)
          return (
            <div key={link.id} className="flex items-center gap-2 px-2 py-1.5">
              <button
                type="button"
                onClick={() => onPreviewAttachment(link.attachment)}
                aria-label={`Preview ${displayName}`}
                title="Preview"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm text-left hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm text-foreground">
                    {displayName}
                    {link.attachment.isVoided && (
                      <span className="ml-1.5 text-xs text-muted-foreground">(Void)</span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    Linked by {link.linkedBy.name ?? link.linkedBy.email}
                  </span>
                </span>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                aria-label={`Unlink ${displayName}`}
                title="Unlink"
                disabled={unlinkingId === link.id}
                onClick={() => onUnlink(link.id)}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface LogDetailDialogProps {
  log: PolicyLog | null
  currentUserId?: number
  onOpenChange: (open: boolean) => void
  // Attachments filed under this log. The parent owns the query and the
  // unlink mutation, keeping this component renderable from a story.
  links?: PolicyLogAttachment[]
  onPreviewAttachment?: (attachment: PolicyAttachment) => void
  onUnlink?: (linkId: number) => void
  unlinkingId?: number
}

// Presentational: takes the selected log as a prop rather than owning its
// own fetch, so it renders standalone in Storybook. Stays mounted (with
// open={log !== null}) so the close animation can play as `log` clears.
export function LogDetailDialog({
  log,
  currentUserId,
  onOpenChange,
  links = [],
  onPreviewAttachment,
  onUnlink,
  unlinkingId,
}: LogDetailDialogProps) {
  return (
    <Dialog open={log !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {log && (
          <>
            <DialogHeader>
              <DialogTitle>Log #{log.logNumber}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <LogAuthorChip author={log.author} isCurrentUser={log.author.id === currentUserId} />
                <span>{log.author.name ?? log.author.email}</span>
                <span>·</span>
                <span>{formatLogTimestamp(log.createdAt)}</span>
              </DialogDescription>
            </DialogHeader>
            <p className="max-h-96 overflow-y-auto rounded-md border bg-muted/30 p-3 font-mono text-sm whitespace-pre-wrap">
              {log.body}
            </p>
            {links.length > 0 && onPreviewAttachment && onUnlink && (
              <LinkedAttachments
                links={links}
                onPreviewAttachment={onPreviewAttachment}
                onUnlink={onUnlink}
                unlinkingId={unlinkingId}
              />
            )}
            <div className="flex justify-end">
              <CopyLogBodyButton key={log.id} body={log.body} />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
