import { useEffect, useRef } from 'react'

export function useSearchShortcut(onTrigger: () => void) {
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat) return
      if (e.code === 'KeyK' && (e.metaKey || e.ctrlKey || e.altKey)) {
        e.preventDefault()
        onTriggerRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
