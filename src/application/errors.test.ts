import { describe, expect, it } from 'vitest'
import { PersistenceError, type PersistenceErrorCode } from '@/persistence'
import { readClock } from './clock'
import { ApplicationError, classifyFailure } from './errors'
import { createTestClock, d, noonOn } from './test-utils/helpers'

describe('readClock', () => {
  it('resolves the injected instant to a local date in the injected zone', () => {
    const berlin = readClock(createTestClock(Date.UTC(2026, 9, 5, 22, 30), 'Europe/Berlin'))
    const tokyo = readClock(createTestClock(Date.UTC(2026, 9, 5, 22, 30), 'Asia/Tokyo'))
    const lisbon = readClock(createTestClock(Date.UTC(2026, 9, 5, 22, 30), 'Europe/Lisbon'))

    expect(berlin.dateKey).toBe(d('2026-10-06')) // 00:30 local
    expect(tokyo.dateKey).toBe(d('2026-10-06'))
    expect(lisbon.dateKey).toBe(d('2026-10-05')) // 23:30 local
    expect(berlin.timeZone).toBe('Europe/Berlin')
    expect(berlin.epochMs).toBe(Date.UTC(2026, 9, 5, 22, 30))
  })

  it('fails with a typed error for an unknown time zone or an invalid instant', () => {
    expect(() => readClock(createTestClock(noonOn('2026-10-05'), 'Not/AZone'))).toThrow(ApplicationError)
    expect(() => readClock(createTestClock(Number.NaN))).toThrow(ApplicationError)
    expect(() => readClock(createTestClock(noonOn('2026-10-05'), ''))).toThrow(
      expect.objectContaining({ code: 'clock_unavailable' }),
    )
  })
})

describe('classifyFailure', () => {
  const persistence = (code: PersistenceErrorCode) => classifyFailure(new PersistenceError(code, 'detail'))

  it('maps storage errors to player-safe reasons', () => {
    expect(persistence('database_unavailable')).toBe('database_unavailable')
    expect(persistence('database_open_failed')).toBe('database_unavailable')
    expect(persistence('database_closed')).toBe('database_unavailable')
    expect(persistence('database_blocked')).toBe('database_blocked')
    expect(persistence('database_version_unsupported')).toBe('newer_data')
    expect(persistence('storage_quota_exceeded')).toBe('storage_full')
    expect(persistence('record_validation_failed')).toBe('data_invalid')
    expect(persistence('ledger_integrity_failed')).toBe('data_invalid')
    expect(persistence('transaction_failed')).toBe('unexpected')
  })

  it('maps application errors and unknown values', () => {
    expect(classifyFailure(new ApplicationError('clock_unavailable', 'x'))).toBe('clock_unavailable')
    expect(classifyFailure(new ApplicationError('inconsistent_data', 'x'))).toBe('data_invalid')
    expect(classifyFailure(new Error('boom'))).toBe('unexpected')
    expect(classifyFailure('nope')).toBe('unexpected')
  })
})
