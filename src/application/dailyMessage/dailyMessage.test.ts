import { describe, expect, it } from 'vitest'
import { addDays, asDateKey, type DateKey } from '@/domain'
import { DAILY_MESSAGES } from './catalog'
import { dailyMessageIndexFor, selectDailyMessage } from './selectDailyMessage'

const sampleDates = (): DateKey[] => {
  const dates: DateKey[] = []
  let current = asDateKey('2025-12-01')
  for (let i = 0; i < 800; i += 1) {
    dates.push(current)
    current = addDays(current, 1)
  }
  return dates
}

describe('Daily Message catalog', () => {
  it('is a starter bank of roughly 30–50 non-empty, unique messages', () => {
    expect(DAILY_MESSAGES.length).toBeGreaterThanOrEqual(30)
    expect(DAILY_MESSAGES.length).toBeLessThanOrEqual(50)
    for (const message of DAILY_MESSAGES) {
      expect(message.trim()).not.toBe('')
      expect(message.length).toBeLessThan(100)
    }
    expect(new Set(DAILY_MESSAGES).size).toBe(DAILY_MESSAGES.length)
  })
})

describe('selectDailyMessage', () => {
  it('returns the same message for the same date, every time', () => {
    const date = asDateKey('2026-10-05')
    const first = selectDailyMessage(date)

    for (let i = 0; i < 25; i += 1) {
      expect(selectDailyMessage(date)).toEqual(first)
    }
  })

  it('never consults a random source', () => {
    const original = Math.random
    Math.random = () => {
      throw new Error('Math.random must not be used')
    }
    try {
      expect(() => selectDailyMessage(asDateKey('2026-10-05'))).not.toThrow()
    } finally {
      Math.random = original
    }
  })

  it('can resolve different dates to different messages', () => {
    const texts = new Set(sampleDates().map((date) => selectDailyMessage(date).text))

    expect(texts.size).toBeGreaterThan(1)
    expect(texts.size).toBe(DAILY_MESSAGES.length)
  })

  it('always selects an index inside the catalog, including dates before the anchor', () => {
    const edgeDates = ['0001-01-01', '1999-12-31', '2025-12-31', '2026-01-01', '2026-02-28', '2028-02-29', '9999-12-31']
    for (const date of [...edgeDates.map(asDateKey), ...sampleDates()]) {
      const { index, text } = selectDailyMessage(date)
      expect(Number.isInteger(index)).toBe(true)
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(DAILY_MESSAGES.length)
      expect(text).toBe(DAILY_MESSAGES[index])
    }
  })

  it('walks the catalog without repeating until it is exhausted', () => {
    const start = asDateKey('2026-03-01')
    const indexes = Array.from({ length: DAILY_MESSAGES.length }, (_, offset) =>
      selectDailyMessage(addDays(start, offset)).index,
    )

    expect(new Set(indexes).size).toBe(DAILY_MESSAGES.length)
  })

  it('maps with a non-negative modulo for any catalog size', () => {
    expect(dailyMessageIndexFor(asDateKey('2026-01-01'), 7)).toBe(0)
    expect(dailyMessageIndexFor(asDateKey('2026-01-08'), 7)).toBe(0)
    expect(dailyMessageIndexFor(asDateKey('2025-12-31'), 7)).toBe(6)
    expect(dailyMessageIndexFor(asDateKey('2026-01-03'), 1)).toBe(0)
  })
})
