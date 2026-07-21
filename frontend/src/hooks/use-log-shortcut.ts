import { useEffect, useRef } from 'react'

// Cmd/Ctrl+L opens the add-log composer for whichever policy is currently
// selected. Mirrors useSearchShortcut's ref pattern so the listener is
// attached once but always calls the latest callback.
export function useLogShortcut(onTrigger: () => void) {
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.code === 'KeyL' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onTriggerRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
