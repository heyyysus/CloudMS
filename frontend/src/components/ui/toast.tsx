import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Toast as ToastPrimitive } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  addToast,
  dismissToast,
  type ToastOptions,
  type ToastRecord,
  type ToastType,
} from '@/lib/toast-queue'

// Each type's accent color is exposed as a CSS custom property rather than
// baked into per-element classes - the left strip, icon and countdown bar
// all read the same var (see CopyText's --copy-underline, index.css, for
// the same pattern). Adding a type later is a one-line addition here.
const toastVariants = cva('', {
  variants: {
    type: {
      info: '[--toast-accent:var(--color-primary)]',
      success: '[--toast-accent:var(--color-success)]',
      error: '[--toast-accent:var(--color-destructive)]',
    },
  },
})

const TOAST_ICONS: Record<ToastType, typeof Info> = {
  info: Info,
  success: CircleCheck,
  error: TriangleAlert,
}

interface ToastItemProps extends VariantProps<typeof toastVariants> {
  type: ToastType
  message: string
  duration: number
  onDismiss?: () => void
}

// Presentational toast, exported standalone so stories (and the a11y addon)
// can exercise it without a provider. type="foreground" switches Radix to
// an assertive live region, so errors interrupt a screen reader the way a
// routine confirmation shouldn't.
export function ToastItem({ type, message, duration, onDismiss }: ToastItemProps) {
  const Icon = TOAST_ICONS[type]

  return (
    <ToastPrimitive.Root
      data-slot="toast"
      type={type === 'error' ? 'foreground' : 'background'}
      duration={duration}
      onOpenChange={(open) => {
        if (!open) onDismiss?.()
      }}
      // Read by the countdown bar's CSS animation below (index.css) - kept
      // as a plain custom property instead of a Tailwind arbitrary value so
      // the animation-duration can vary per-toast without a style tag.
      style={{ '--toast-duration': `${duration}ms` } as CSSProperties}
      className={cn(
        toastVariants({ type }),
        'relative flex w-full overflow-hidden rounded-xl bg-card text-card-foreground ring-1 ring-foreground/10 shadow-lg duration-100 data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-top-2 data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-top-2 motion-reduce:animate-none data-[swipe=cancel]:translate-y-0 data-[swipe=end]:translate-y-[var(--radix-toast-swipe-end-y)] data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=move]:transition-none'
      )}
    >
      {/* Full-height accent strip - the primary type signal, deliberately
          left unbroken by the countdown bar below (which starts to its
          right, inside the content column). */}
      <span aria-hidden className="w-1 shrink-0 bg-(--toast-accent)" />
      <div className="relative flex flex-1 items-start gap-2 py-3 pr-2 pl-3">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-(--toast-accent)" />
        <ToastPrimitive.Title className="line-clamp-2 flex-1 text-sm">
          {message}
        </ToastPrimitive.Title>
        <ToastPrimitive.Close
          aria-label="Dismiss"
          className="shrink-0 rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <X className="size-3.5" />
        </ToastPrimitive.Close>
        <span
          data-slot="toast-countdown"
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 bg-(--toast-accent)"
        />
      </div>
    </ToastPrimitive.Root>
  )
}

interface ToastContextValue {
  info: (message: string, options?: ToastOptions) => void
  success: (message: string, options?: ToastOptions) => void
  error: (message: string, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  // Radix pauses each toast's dismiss timer on window blur (e.g. switching
  // tabs) as well as hover/focus, so the countdown bar shouldn't keep
  // draining while the tab is backgrounded. Hover/focus are plain CSS
  // (:hover/:focus-within in index.css); blur has no CSS equivalent, so it's
  // mirrored here as a data-paused attribute the same CSS rule reads.
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    function onBlur() {
      setPaused(true)
    }
    function onFocus() {
      setPaused(false)
    }
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  function dismiss(id: string) {
    setToasts((prev) => dismissToast(prev, id))
  }

  // useMemo (not useCallback per-method) so `info`/`success`/`error` stay
  // referentially stable across renders - `show` only closes over the
  // setState setter, which React guarantees is itself stable.
  const value = useMemo<ToastContextValue>(() => {
    function show(type: ToastType, message: string, options?: ToastOptions) {
      setToasts((prev) => addToast(prev, type, message, options))
    }
    return {
      info: (message, options) => show('info', message, options),
      success: (message, options) => show('success', message, options),
      error: (message, options) => show('error', message, options),
    }
  }, [])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastPrimitive.Provider swipeDirection="up">
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            type={toast.type}
            message={toast.message}
            duration={toast.duration}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
        {/* z-100 clears dialogs (z-50, see dialog.tsx) so a toast fired from
            inside an open dialog - e.g. a mutation failure - stays visible.
            Overlaps the 56px app header by design: it's the one position
            that's consistent on /login too, which has no header at all. */}
        <ToastPrimitive.Viewport
          data-slot="toast-viewport"
          data-paused={paused ? '' : undefined}
          className="fixed top-4 left-1/2 z-100 flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4 outline-none"
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
