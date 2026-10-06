import { afterEach, describe, expect, it } from 'vitest'
import { isNativeApp } from './native'

const scope = globalThis as { Capacitor?: unknown }

afterEach(() => {
  delete scope.Capacitor
})

describe('isNativeApp', () => {
  it('is false in a plain browser (no Capacitor global)', () => {
    expect(isNativeApp()).toBe(false)
  })

  it('is true only when the shell says it is a native platform', () => {
    scope.Capacitor = { isNativePlatform: () => true }
    expect(isNativeApp()).toBe(true)
    scope.Capacitor = { isNativePlatform: () => false }
    expect(isNativeApp()).toBe(false)
  })

  it('is false for a malformed global and never throws', () => {
    scope.Capacitor = {}
    expect(isNativeApp()).toBe(false)
    scope.Capacitor = { isNativePlatform: 'yes' }
    expect(isNativeApp()).toBe(false)
    scope.Capacitor = {
      isNativePlatform: () => {
        throw new Error('bridge not ready')
      },
    }
    expect(isNativeApp()).toBe(false)
  })
})
