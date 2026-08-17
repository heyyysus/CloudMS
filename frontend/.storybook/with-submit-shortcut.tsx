import type { ReactNode } from 'react'
import { useSubmitShortcut } from '../src/hooks/use-submit-shortcut'

// The app registers this once in AppLayout; mirroring it in preview.tsx's
// global decorator means form stories behave like the real thing and can
// exercise Cmd/Ctrl+Enter in play functions. A component rather than a bare
// hook call in the decorator, since decorators aren't rendered as components.
export function WithSubmitShortcut({ children }: { children: ReactNode }) {
  useSubmitShortcut()
  return children
}
