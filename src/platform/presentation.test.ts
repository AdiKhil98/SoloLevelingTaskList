import { afterEach, describe, expect, it, vi } from 'vitest'
import { getAudioContext, primeAudio } from './audio'
import { canVibrate, vibrate } from './haptics'
import { pageVisibility } from './page'
import { readPreference, reducedMotionPreference, writePreference } from './preferences'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

describe('preferences (localStorage, guarded)', () => {
  it('stores and reads a value', () => {
    expect(writePreference('k', 'v')).toBe(true)
    expect(readPreference('k')).toBe('v')
    expect(readPreference('missing')).toBeNull()
  })

  it('never throws when storage is blocked or full', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    expect(readPreference('k')).toBeNull()
    expect(writePreference('k', 'v')).toBe(false)
  })
})

describe('the device reduced-motion preference', () => {
  it('is false where matchMedia does not exist, and its subscription is a safe no-op', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(reducedMotionPreference.get()).toBe(false)
    expect(() => reducedMotionPreference.subscribe(() => undefined)()).not.toThrow()
  })

  it('reads the media query and unsubscribes cleanly', () => {
    const listeners = new Set<() => void>()
    const query = {
      matches: true,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }
    vi.stubGlobal('matchMedia', vi.fn(() => query))
    expect(reducedMotionPreference.get()).toBe(true)
    const stop = reducedMotionPreference.subscribe(() => undefined)
    expect(listeners.size).toBe(1)
    stop()
    expect(listeners.size).toBe(0)
  })
})

describe('haptics', () => {
  it('does nothing, silently, where the Vibration API is missing', () => {
    vi.stubGlobal('navigator', {})
    expect(canVibrate()).toBe(false)
    expect(vibrate([20])).toBe(false)
  })

  it('does not call vibrate before the page has had a user gesture (Chrome would log an intervention)', () => {
    const call = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate: call, userActivation: { hasBeenActive: false } })
    expect(vibrate([20])).toBe(false)
    expect(call).not.toHaveBeenCalled()
  })

  it('vibrates with a copy of the pattern after a gesture', () => {
    const call = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate: call, userActivation: { hasBeenActive: true } })
    const pattern = [40, 60, 40] as const
    expect(vibrate(pattern)).toBe(true)
    expect(call).toHaveBeenCalledWith([40, 60, 40])
  })

  it('vibrates where the browser has no userActivation API', () => {
    const call = vi.fn(() => true)
    vi.stubGlobal('navigator', { vibrate: call })
    expect(vibrate([15])).toBe(true)
  })

  it('swallows a vibrate that throws: no haptic failure may break gameplay', () => {
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('boom')
      },
    })
    expect(vibrate([15])).toBe(false)
  })
})

describe('audio', () => {
  it('has no context where Web Audio is missing, and priming reports that sound cannot play', async () => {
    vi.stubGlobal('AudioContext', undefined)
    vi.stubGlobal('webkitAudioContext', undefined)
    expect(getAudioContext()).toBeNull()
    expect(await primeAudio()).toBe(false)
  })
})

describe('page visibility', () => {
  it('reports hidden pages and notifies on changes', () => {
    const listener = vi.fn()
    const stop = pageVisibility.subscribe(listener)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalledTimes(1)
    stop()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalledTimes(1)
    expect(pageVisibility.isHidden()).toBe(false)
  })
})
