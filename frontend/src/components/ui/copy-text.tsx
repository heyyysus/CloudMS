import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'

// Shared copy-to-clipboard state: a brief "copied" flag that resets itself
// after 1500ms. Consolidates the logic previously duplicated between
// ClientIdCopyButton (client-summary-card.tsx) and CopyLogBodyButton
// (log-detail-dialog.tsx).
export function useCopyToClipboard(): {
  copied: boolean
  copy: (text: string) => Promise<boolean>
} {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timeout)
  }, [copied])

  function copy(text: string) {
    return navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        return true
      },
      () => {
        // Clipboard write can reject (permissions, insecure context, etc.) -
        // leave `copied` false rather than lying about success.
        return false
      }
    )
  }

  return { copied, copy }
}

interface CopyTextProps {
  value: ReactNode
  // Text actually copied to the clipboard. Defaults to `value` when it's a
  // plain string; pass this explicitly when `value` is formatted for display
  // (e.g. a formatted phone number) but the raw form should be copied.
  copyValue?: string
  label?: string
  className?: string
}

// The entire value is the click target - clicking anywhere on it copies.
// The value text itself never changes (a "Copied" swap would hurt
// readability); feedback is an info toast, fired only once the clipboard
// write actually succeeds.
export function CopyText({ value, copyValue, label, className }: CopyTextProps) {
  const { copy } = useCopyToClipboard()
  const toast = useToast()
  const text = copyValue ?? (typeof value === 'string' ? value : undefined)

  if (text === undefined) return <span className={className}>{value}</span>

  return (
    <button
      type="button"
      onClick={async () => {
        if (await copy(text)) toast.info('Copied to Clipboard')
      }}
      aria-label={label ? `Copy ${label}` : `Copy ${text}`}
      title="Click to copy"
      className={cn(
        // Underline color comes from the --copy-underline var (index.css),
        // not a `dark:` variant class - a plain CSS custom property avoids
        // any dependence on Tailwind's dark-variant selector specificity.
        'cursor-grab rounded-sm text-left underline decoration-dotted underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [text-decoration-color:var(--copy-underline)]',
        className
      )}
    >
      {value}
    </button>
  )
}
