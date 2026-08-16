export type ToastType = 'info' | 'success' | 'error'

export interface ToastRecord {
  id: string
  type: ToastType
  message: string
  duration: number
}

export interface ToastOptions {
  duration?: number
}

// Errors carry more to read than a plain confirmation, so they linger
// longer; info and success are brief by design (this is meant to be
// non-intrusive, not a message center).
export const DURATIONS: Record<ToastType, number> = {
  info: 2000,
  success: 2000,
  error: 4000,
}

// Caps how many toasts can be visible at once. Without a cap, a burst of
// failures (e.g. several rejected requests in flight at once) would stack
// indefinitely and bury the page content.
export const MAX_VISIBLE = 3

let nextId = 0

export function addToast(
  state: ToastRecord[],
  type: ToastType,
  message: string,
  options?: ToastOptions
): ToastRecord[] {
  const record: ToastRecord = {
    id: `toast-${++nextId}`,
    type,
    message,
    duration: options?.duration ?? DURATIONS[type],
  }
  const next = [...state, record]
  return next.length > MAX_VISIBLE ? next.slice(next.length - MAX_VISIBLE) : next
}

export function dismissToast(state: ToastRecord[], id: string): ToastRecord[] {
  return state.filter((toast) => toast.id !== id)
}
