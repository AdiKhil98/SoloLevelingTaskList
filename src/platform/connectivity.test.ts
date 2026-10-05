import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectivity } from './connectivity'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('connectivity (informational only)', () => {
  it('reports what the browser reports', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get')
    onLine.mockReturnValue(true)
    expect(connectivity.isOnline()).toBe(true)
    onLine.mockReturnValue(false)
    expect(connectivity.isOnline()).toBe(false)
  })

  it('notifies on the online and offline events, and stops after unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = connectivity.subscribe(listener)

    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    window.dispatchEvent(new Event('offline'))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
