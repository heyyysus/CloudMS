import { describe, expect, it } from 'vitest'
import { addToast, dismissToast, DURATIONS, MAX_VISIBLE, type ToastRecord } from './toast-queue'

describe('addToast', () => {
  it('applies the default duration for the toast type', () => {
    const state = addToast([], 'success', 'Client saved')
    expect(state[0].duration).toBe(DURATIONS.success)
  })

  it('gives error toasts a longer default duration than info/success', () => {
    expect(DURATIONS.error).toBeGreaterThan(DURATIONS.info)
    expect(DURATIONS.error).toBeGreaterThan(DURATIONS.success)
  })

  it('lets an explicit duration override the type default', () => {
    const state = addToast([], 'info', 'Syncing…', { duration: 10000 })
    expect(state[0].duration).toBe(10000)
  })

  it('appends to existing toasts, preserving order', () => {
    const first = addToast([], 'info', 'First')
    const both = addToast(first, 'success', 'Second')
    expect(both.map((t) => t.message)).toEqual(['First', 'Second'])
  })

  it(`caps visible toasts at ${MAX_VISIBLE}, dropping the oldest`, () => {
    let state: ToastRecord[] = []
    for (let i = 1; i <= MAX_VISIBLE + 2; i++) {
      state = addToast(state, 'info', `Toast ${i}`)
    }
    expect(state).toHaveLength(MAX_VISIBLE)
    expect(state.map((t) => t.message)).toEqual(['Toast 3', 'Toast 4', 'Toast 5'])
  })

  it('assigns each toast a unique id', () => {
    const state = addToast(addToast([], 'info', 'A'), 'info', 'B')
    expect(state[0].id).not.toBe(state[1].id)
  })
})

describe('dismissToast', () => {
  it('removes the toast with the matching id', () => {
    const state = addToast(addToast([], 'info', 'A'), 'success', 'B')
    const [a] = state
    const next = dismissToast(state, a.id)
    expect(next.map((t) => t.message)).toEqual(['B'])
  })

  it('is a no-op when the id is not present', () => {
    const state = addToast([], 'info', 'A')
    const next = dismissToast(state, 'not-a-real-id')
    expect(next).toEqual(state)
  })
})
