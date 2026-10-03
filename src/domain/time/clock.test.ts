import { describe, expect, it } from 'vitest'
import { clockReadingAt } from './clock'


function reading(epochMs: number, timeZone: string) {
  const result = clockReadingAt(epochMs, timeZone)
  if (!result.ok) throw new Error(`unexpected error: ${result.error.code}`)
  return result.value
}

// 2026-10-03T23:30:00Z
const INSTANT = Date.UTC(2026, 9, 3, 23, 30, 0)

describe('clockReadingAt', () => {
  it('resolves the same instant to different dates in different explicit zones', () => {
    expect(reading(INSTANT, 'UTC')).toMatchObject({
      dateKey: '2026-10-03',
      utcOffsetMinutes: 0,
      timeZone: 'UTC',
    })
    expect(reading(INSTANT, 'Pacific/Auckland')).toMatchObject({
      dateKey: '2026-10-04',
      utcOffsetMinutes: 13 * 60, // NZDT
    })
    expect(reading(INSTANT, 'America/Los_Angeles')).toMatchObject({
      dateKey: '2026-10-03',
      utcOffsetMinutes: -7 * 60, // PDT
    })
    expect(reading(INSTANT, 'Asia/Kolkata').utcOffsetMinutes).toBe(330)
  })

  it('returns the zone exactly as supplied and echoes the instant', () => {
    const result = reading(INSTANT, 'Europe/Berlin')
    expect(result.timeZone).toBe('Europe/Berlin')
    expect(result.epochMs).toBe(INSTANT)
    expect(result.dateKey).toBe('2026-10-04') // 01:30 CEST on the 4th
    expect(result.utcOffsetMinutes).toBe(120)
  })

  it('places the local midnight boundary correctly', () => {
    const justBefore = Date.UTC(2026, 9, 3, 21, 59, 59, 999) // 23:59:59.999 CEST
    const atMidnight = Date.UTC(2026, 9, 3, 22, 0, 0, 0) // 00:00:00.000 CEST on the 4th
    expect(reading(justBefore, 'Europe/Berlin').dateKey).toBe('2026-10-03')
    expect(reading(atMidnight, 'Europe/Berlin').dateKey).toBe('2026-10-04')
  })

  it('tracks the UTC offset across a DST change in the named zone', () => {
    const beforeUs = Date.UTC(2026, 2, 8, 6, 59, 0) // 01:59 EST
    const afterUs = Date.UTC(2026, 2, 8, 7, 0, 0) // 03:00 EDT
    expect(reading(beforeUs, 'America/New_York').utcOffsetMinutes).toBe(-300)
    expect(reading(afterUs, 'America/New_York').utcOffsetMinutes).toBe(-240)
    // Both are the same calendar date even though that day has 23 hours.
    expect(reading(beforeUs, 'America/New_York').dateKey).toBe('2026-03-08')
    expect(reading(afterUs, 'America/New_York').dateKey).toBe('2026-03-08')
  })

  it('does not depend on the machine timezone', () => {
    // Same inputs, same outputs: the zone is never discovered from the host.
    const first = reading(INSTANT, 'Asia/Tokyo')
    const second = reading(INSTANT, 'Asia/Tokyo')
    expect(first).toEqual(second)
    expect(first.dateKey).toBe('2026-10-04')
  })

  it('rejects unknown or empty zones with a typed error', () => {
    for (const zone of ['Not/AZone', '', '   ']) {
      const result = clockReadingAt(INSTANT, zone)
      expect(result).toEqual({
        ok: false,
        error: { code: 'invalid_time_zone', timeZone: zone },
      })
    }
  })

  it('rejects instants that are not usable epoch milliseconds', () => {
    for (const bad of [Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      const result = clockReadingAt(bad, 'UTC')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('invalid_epoch')
    }
  })
})
