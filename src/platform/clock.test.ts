import { describe, expect, it } from 'vitest'
import { systemClock } from './clock'

describe('systemClock', () => {
  it('reports the current instant as epoch milliseconds', () => {
    const before = Date.now()
    const reading = systemClock.now()
    const after = Date.now()

    expect(Number.isSafeInteger(reading)).toBe(true)
    expect(reading).toBeGreaterThanOrEqual(before)
    expect(reading).toBeLessThanOrEqual(after)
  })

  it('reports an IANA time zone the runtime understands', () => {
    const zone = systemClock.timeZone()

    expect(zone).not.toBe('')
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: zone })).not.toThrow()
  })
})
