import { beforeEach, describe, expect, it } from 'vitest'
import { loadTabs, removeTabById, saveTabs, upsertTab, type ClientTab } from './client-tabs-storage'

function createMemoryLocalStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = createMemoryLocalStorage()
})

describe('upsertTab', () => {
  it('appends a new tab', () => {
    const tabs: ClientTab[] = [{ id: 1, label: 'Jane Doe' }]
    const next = upsertTab(tabs, { id: 2, label: 'John Smith' })
    expect(next).toEqual([
      { id: 1, label: 'Jane Doe' },
      { id: 2, label: 'John Smith' },
    ])
  })

  it('updates the label of an existing tab in place (no reorder)', () => {
    const tabs: ClientTab[] = [
      { id: 1, label: 'Jane Doe' },
      { id: 2, label: 'John Smith' },
    ]
    const next = upsertTab(tabs, { id: 1, label: 'Jane D.' })
    expect(next).toEqual([
      { id: 1, label: 'Jane D.' },
      { id: 2, label: 'John Smith' },
    ])
  })

  it('returns the same array reference when nothing changed', () => {
    const tabs: ClientTab[] = [{ id: 1, label: 'Jane Doe' }]
    const next = upsertTab(tabs, { id: 1, label: 'Jane Doe' })
    expect(next).toBe(tabs)
  })
})

describe('removeTabById', () => {
  it('removes the matching tab', () => {
    const tabs: ClientTab[] = [
      { id: 1, label: 'Jane Doe' },
      { id: 2, label: 'John Smith' },
    ]
    expect(removeTabById(tabs, 1)).toEqual([{ id: 2, label: 'John Smith' }])
  })

  it('is a no-op when the id is not present', () => {
    const tabs: ClientTab[] = [{ id: 1, label: 'Jane Doe' }]
    expect(removeTabById(tabs, 999)).toEqual(tabs)
  })
})

describe('loadTabs / saveTabs', () => {
  it('round-trips through localStorage', () => {
    const tabs: ClientTab[] = [{ id: 1, label: 'Jane Doe' }]
    saveTabs(tabs)
    expect(loadTabs()).toEqual(tabs)
  })

  it('returns [] when nothing is stored', () => {
    expect(loadTabs()).toEqual([])
  })

  it('returns [] for garbage JSON', () => {
    localStorage.setItem('cloudms.open-client-tabs', 'not json{{{')
    expect(loadTabs()).toEqual([])
  })

  it('returns [] when the stored value is not an array', () => {
    localStorage.setItem('cloudms.open-client-tabs', JSON.stringify({ id: 1 }))
    expect(loadTabs()).toEqual([])
  })

  it('filters out malformed entries', () => {
    localStorage.setItem(
      'cloudms.open-client-tabs',
      JSON.stringify([{ id: 1, label: 'Jane Doe' }, { id: 'oops' }, { label: 'no id' }, null]),
    )
    expect(loadTabs()).toEqual([{ id: 1, label: 'Jane Doe' }])
  })
})
