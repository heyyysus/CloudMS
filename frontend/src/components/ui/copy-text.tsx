import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Shared copy-to-clipboard state: a brief "copied" flag that resets itself
// after 1500ms. Consolidates the logic previously duplicated between
// ClientIdCopyButton (client-summary-card.tsx) and CopyLogBodyButton
// (log-detail-dialog.tsx).
export function useCopyToClipboard(): { copied: boolean; copy: (text: string) => void } {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timeout = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timeout)
  }, [copied])

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => setCopied(true),
      () => {
        // Clipboard write can reject (permissions, insecure context, etc.) -
        // leave `copied` false rather than lying about success.
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
// readability); feedback is a brief background highlight that fades back
// out, driven by the same `copied` flag used for the flash below.
export function CopyText({ value, copyValue, label, className }: CopyTextProps) {
  const { copied, copy } = useCopyToClipboard()
  const text = copyValue ?? (typeof value === 'string' ? value : undefined)

  if (text === undefined) return <span className={className}>{value}</span>

  return (
    <button
      type="button"
      onClick={() => copy(text)}
      aria-label={label ? `Copy ${label}` : `Copy ${text}`}
      title="Click to copy"
      className={cn(
        // Underline color comes from the --copy-underline var (index.css),
        // not a `dark:` variant class - a plain CSS custom property avoids
        // any dependence on Tailwind's dark-variant selector specificity.
        'cursor-grab rounded-sm text-left underline decoration-dotted underline-offset-2 transition-colors duration-150 hover:bg-primary/10 hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [text-decoration-color:var(--copy-underline)]',
        copied && 'bg-primary/20',
        className
      )}
    >
      {value}
    </button>
  )
}
