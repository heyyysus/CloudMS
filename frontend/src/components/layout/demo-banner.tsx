import { demoBannerText } from '@/lib/demo'

interface DemoBannerProps {
  demoMode: boolean
  resetMinutes?: number
}

// Rendered inside each flex-column shell (the app content column and the
// login page) rather than once above <Routes>: the sidebar is fixed and
// h-svh, so a document-level bar would sit under it and add a permanent
// scroll. Renders nothing outside demo mode so call sites stay one line.
export function DemoBanner({ demoMode, resetMinutes }: DemoBannerProps) {
  if (!demoMode) return null
  return (
    <div
      role="status"
      className="flex h-8 shrink-0 items-center justify-center bg-warning/20 px-4 text-center text-xs font-medium text-foreground"
    >
      {demoBannerText(resetMinutes)}
    </div>
  )
}
