export interface ClientTab {
  id: number
  label: string
}

const STORAGE_KEY = 'cloudms.open-client-tabs'

function isClientTab(value: unknown): value is ClientTab {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ClientTab).id === 'number' &&
    typeof (value as ClientTab).label === 'string'
  )
}

export function loadTabs(): ClientTab[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isClientTab)
  } catch {
    return []
  }
}

export function saveTabs(tabs: ClientTab[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  } catch {
    // localStorage unavailable (private mode, quota) — tabs just won't persist
  }
}

export function upsertTab(tabs: ClientTab[], tab: ClientTab): ClientTab[] {
  const existing = tabs.find((t) => t.id === tab.id)
  if (existing) {
    if (existing.label === tab.label) return tabs
    return tabs.map((t) => (t.id === tab.id ? { ...t, label: tab.label } : t))
  }
  return [...tabs, tab]
}

export function removeTabById(tabs: ClientTab[], id: number): ClientTab[] {
  return tabs.filter((t) => t.id !== id)
}
