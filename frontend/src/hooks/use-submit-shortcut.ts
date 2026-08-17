import { useEffect } from 'react'

// Cmd/Ctrl+Enter submits whichever form holds focus. Registered once from
// AppLayout so every form gets it - including future ones - with no per-form
// wiring. Plain Enter is deliberately left alone: it stays a newline inside a
// textarea and still natively submits from a single-line input.
//
// Radix portals Select/Popover/Combobox content to document.body, outside the
// form's DOM tree, so the shortcut is a no-op while one of those is open. That
// is fine - those popovers own Enter for choosing an option, and closing one
// puts focus back inside the form.
export function useSubmitShortcut() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      // e.key rather than e.code so NumpadEnter counts too.
      if (e.key !== 'Enter') return
      if (!e.metaKey && !e.ctrlKey) return
      if (e.isComposing) return // IME candidate commit, not a submit
      const form = (e.target as HTMLElement | null)?.closest?.('form')
      if (!form) return
      // Every submit button in the app is disabled={isPending}. requestSubmit
      // ignores that on its own, so check it here or the shortcut can fire a
      // second mutation while the first is still in flight.
      const submitter = form.querySelector<HTMLButtonElement>('button[type="submit"]')
      if (submitter?.disabled) return
      e.preventDefault()
      form.requestSubmit(submitter ?? undefined)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
