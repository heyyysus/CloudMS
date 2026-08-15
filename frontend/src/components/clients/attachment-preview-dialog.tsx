import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { DownloadIcon, ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatFileSize } from '@/lib/format-file-size'
import { getPolicyAttachmentLink, type PolicyAttachment } from '@/api/policyAttachments'

interface AttachmentPreviewDialogProps {
  attachment: PolicyAttachment | null
  onOpenChange: (open: boolean) => void
  getPolicyAttachmentLinkFn?: typeof getPolicyAttachmentLink
}

// Presentational: takes the selected attachment as a prop rather than owning
// its own fetch of the list, so it renders standalone in Storybook. Stays
// mounted (with open={attachment !== null}) so the close animation can play
// as `attachment` clears - same pattern as LogDetailDialog.
export function AttachmentPreviewDialog({
  attachment,
  onOpenChange,
  getPolicyAttachmentLinkFn = getPolicyAttachmentLink,
}: AttachmentPreviewDialogProps) {
  const [downloading, setDownloading] = useState(false)

  const linkQuery = useQuery({
    queryKey: ['policyAttachmentLink', attachment?.id],
    queryFn: ({ signal }) => getPolicyAttachmentLinkFn(attachment!.id, { signal }),
    enabled: attachment !== null,
  })

  async function download() {
    if (!attachment || downloading) return
    setDownloading(true)
    try {
      const { url } = await getPolicyAttachmentLinkFn(attachment.id, { disposition: 'attachment' })
      window.location.assign(url)
    } finally {
      setDownloading(false)
    }
  }

  function openInNewTab() {
    if (linkQuery.data) window.open(linkQuery.data.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <Dialog open={attachment !== null} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] flex-col sm:max-w-5xl">
        {attachment && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate">{attachment.fileName}</DialogTitle>
              <DialogDescription>
                {attachment.description ?? formatFileSize(attachment.sizeBytes)}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-hidden rounded-md border bg-muted/30">
              {linkQuery.isPending && (
                <div className="flex h-full items-center justify-center p-4">
                  <Skeleton className="h-full w-full" />
                </div>
              )}
              {linkQuery.isError && (
                <p className="flex h-full items-center justify-center p-4 text-sm text-destructive">
                  Failed to load preview.
                </p>
              )}
              {linkQuery.data && attachment.mimeType === 'application/pdf' && (
                <iframe
                  src={linkQuery.data.url}
                  title={attachment.fileName}
                  className="h-full w-full"
                />
              )}
              {linkQuery.data && attachment.mimeType.startsWith('image/') && (
                <div className="flex h-full items-center justify-center overflow-auto p-4">
                  <img
                    src={linkQuery.data.url}
                    alt={attachment.fileName}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              )}
              {linkQuery.data &&
                attachment.mimeType !== 'application/pdf' &&
                !attachment.mimeType.startsWith('image/') && (
                  <p className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground">
                    This file type can't be previewed. Use Download or Open in new tab instead.
                  </p>
                )}
            </div>

            <DialogFooter className="sm:justify-end">
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={downloading}
                onClick={download}
              >
                <DownloadIcon />
                {downloading ? 'Downloading…' : 'Download'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={!linkQuery.data}
                onClick={openInNewTab}
              >
                <ExternalLinkIcon />
                Open in new tab
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
