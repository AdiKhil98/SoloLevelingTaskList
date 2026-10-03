import { describe, expect, it } from 'vitest'
import {
  addDays,
  asDateKey,
  compareDateKeys,
  dateKeyFromLocalDate,
  dateKeyParts,
  daysBetween,
  daysInMonth,
  isDateKey,
  isLeapYear,
  isoWeekday,
  makeDateKey,
  nextDate,
  parseDateKey,
  previousDate,
} from './dateKey'

const d = asDateKey

describe('parseDateKey', () => {
  it.each(['2026-10-03', '2026-02-28', '2028-02-29', '0001-01-01', '9999-12-31'])(
    'accepts %s',
    (input) => {
      const result = parseDateKey(input)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(input)
    },
  )

  it.each([
    ['2026-13-01', 'impossible_date'],
    ['2026-02-30', 'impossible_date'],
    ['2026-00-12', 'impossible_date'],
    ['2026-04-31', 'impossible_date'],
    ['2026-01-00', 'impossible_date'],
    ['2027-02-29', 'impossible_date'],
    ['1900-02-29', 'impossible_date'],
    ['0000-05-05', 'year_out_of_range'],
    ['abcd-ef-gh', 'malformed'],
    ['2026-1-1', 'malformed'],
    ['2026/10/03', 'malformed'],
    [' 2026-10-03', 'malformed'],
    ['2026-10-03T00:00', 'malformed'],
    ['', 'malformed'],
  ])('rejects %j without normalizing it (%s)', (input, code) => {
    const result = parseDateKey(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })

  it('does not accept values that only a normalizing parser would repair', () => {
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey(20261003)).toBe(false)
    expect(isDateKey(null)).toBe(false)
  })
})

describe('leap years', () => {
  it('accepts Feb 29 only in leap years', () => {
    expect(parseDateKey('2028-02-29').ok).toBe(true)
    expect(parseDateKey('2000-02-29').ok).toBe(true)
    expect(parseDateKey('2027-02-29').ok).toBe(false)
    expect(parseDateKey('2100-02-29').ok).toBe(false)
  })

  it('applies the 4/100/400 rule', () => {
    expect(isLeapYear(2028)).toBe(true)
    expect(isLeapYear(1900)).toBe(false)
    expect(isLeapYear(2000)).toBe(true)
    expect(isLeapYear(2027)).toBe(false)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2027, 2)).toBe(28)
  })
})

describe('asDateKey / makeDateKey', () => {
  it('throws a typed error for invalid input', () => {
    expect(() => asDateKey('2026-02-30')).toThrow(
      expect.objectContaining({ code: 'invalid_date_key' }),
    )
    expect(() => makeDateKey(2027, 2, 29)).toThrow(
      expect.objectContaining({ code: 'invalid_date_parts' }),
    )
    expect(() => makeDateKey(2026, 1.5, 1)).toThrow()
  })

  it('builds zero-padded keys and round-trips through dateKeyParts', () => {
    const key = makeDateKey(2026, 3, 7)
    expect(key).toBe('2026-03-07')
    expect(dateKeyParts(key)).toEqual({ year: 2026, month: 3, day: 7 })
  })
})

describe('calendar arithmetic', () => {
  it('moves to the next date across a month boundary', () => {
    expect(nextDate(d('2026-01-31'))).toBe('2026-02-01')
    expect(nextDate(d('2026-02-28'))).toBe('2026-03-01')
    expect(nextDate(d('2028-02-28'))).toBe('2028-02-29')
    expect(nextDate(d('2028-02-29'))).toBe('2028-03-01')
  })

  it('moves to the next date across a year boundary', () => {
    expect(nextDate(d('2026-12-31'))).toBe('2027-01-01')
  })

  it('moves to the previous date across month and year boundaries', () => {
    expect(previousDate(d('2026-03-01'))).toBe('2026-02-28')
    expect(previousDate(d('2028-03-01'))).toBe('2028-02-29')
    expect(previousDate(d('2027-01-01'))).toBe('2026-12-31')
  })

  it('adds and subtracts arbitrary day counts', () => {
    expect(addDays(d('2026-10-03'), 0)).toBe('2026-10-03')
    expect(addDays(d('2026-10-03'), 28)).toBe('2026-10-31')
    expect(addDays(d('2026-10-03'), -3)).toBe('2026-09-30')
    expect(addDays(d('2026-01-01'), 365)).toBe('2027-01-01')
    expect(addDays(d('2028-01-01'), 366)).toBe('2029-01-01')
  })

  it('rejects non-integer offsets and results outside the supported years', () => {
    expect(() => addDays(d('2026-10-03'), 1.5)).toThrow(
      expect.objectContaining({ code: 'invalid_count' }),
    )
    expect(() => nextDate(d('9999-12-31'))).toThrow(
      expect.objectContaining({ code: 'date_out_of_range' }),
    )
    expect(() => previousDate(d('0001-01-01'))).toThrow(
      expect.objectContaining({ code: 'date_out_of_range' }),
    )
  })

  it('agrees with a brute-force reference over a wide range', () => {
    const start = Date.UTC(1999, 0, 1)
    let key = d('1999-01-01')
    for (let offset = 0; offset < 366 * 40; offset += 1) {
      const expected = new Date(start + offset * 86_400_000)
        .toISOString()
        .slice(0, 10)
      expect(key).toBe(expected)
      key = nextDate(key)
    }
  })
})

describe('daysBetween', () => {
  it('counts calendar days, signed', () => {
    expect(daysBetween(d('2026-10-01'), d('2026-10-01'))).toBe(0)
    expect(daysBetween(d('2026-10-01'), d('2026-10-03'))).toBe(2)
    expect(daysBetween(d('2026-10-03'), d('2026-10-01'))).toBe(-2)
    expect(daysBetween(d('2026-12-31'), d('2027-01-01'))).toBe(1)
    expect(daysBetween(d('2028-02-28'), d('2028-03-01'))).toBe(2)
    expect(daysBetween(d('2027-02-28'), d('2027-03-01'))).toBe(1)
    expect(daysBetween(d('2026-01-01'), d('2027-01-01'))).toBe(365)
  })
})

describe('isoWeekday', () => {
  it('numbers Monday 1 … Sunday 7', () => {
    // 2026-10-05 is a Monday.
    const week = [
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
    ].map((key) => isoWeekday(d(key)))
    expect(week).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('is correct for known historical and leap dates', () => {
    expect(isoWeekday(d('1970-01-01'))).toBe(4) // Thursday
    expect(isoWeekday(d('2000-01-01'))).toBe(6) // Saturday
    expect(isoWeekday(d('2024-02-29'))).toBe(4) // Thursday
    expect(isoWeekday(d('1969-12-31'))).toBe(3) // Wednesday (before the epoch)
    expect(isoWeekday(d('0001-01-01'))).toBe(1) // Monday
  })
})

describe('DST-safe date-only arithmetic', () => {
  // Dates on which common timezones change their UTC offset, so the calendar
  // day is 23 or 25 hours long. Date-only math must still advance one day.
  const dstDates = [
    '2026-03-08', // US spring forward
    '2026-11-01', // US fall back
    '2026-03-29', // EU spring forward
    '2026-10-25', // EU fall back
    '2026-04-05', // AU fall back
    '2026-10-04', // AU spring forward
  ]

  it.each(dstDates)('advances exactly one calendar day across %s', (dst) => {
    const before = previousDate(d(dst))
    const after = nextDate(d(dst))
    expect(daysBetween(before, d(dst))).toBe(1)
    expect(daysBetween(d(dst), after)).toBe(1)
    expect(daysBetween(before, after)).toBe(2)
    expect(addDays(before, 2)).toBe(after)
  })

  it('keeps an every-2-days cadence aligned through DST changes', () => {
    let key = d('2026-03-01')
    const visited: string[] = []
    for (let i = 0; i < 6; i += 1) {
      visited.push(key)
      key = addDays(key, 2)
    }
    expect(visited).toEqual([
      '2026-03-01',
      '2026-03-03',
      '2026-03-05',
      '2026-03-07',
      '2026-03-09',
      '2026-03-11',
    ])
  })
})

describe('compareDateKeys', () => {
  it('orders chronologically', () => {
    expect(compareDateKeys(d('2026-10-03'), d('2026-10-03'))).toBe(0)
    expect(compareDateKeys(d('2026-10-03'), d('2026-10-04'))).toBe(-1)
    expect(compareDateKeys(d('2027-01-01'), d('2026-12-31'))).toBe(1)
    expect(compareDateKeys(d('0999-12-31'), d('1000-01-01'))).toBe(-1)
  })
})

describe('dateKeyFromLocalDate', () => {
  it('reads the explicitly supplied Date by its LOCAL calendar fields', () => {
    // Constructed from local fields, so the result is independent of the
    // machine's timezone (including near-midnight times that differ in UTC).
    expect(dateKeyFromLocalDate(new Date(2026, 9, 3, 0, 0, 1))).toBe('2026-10-03')
    expect(dateKeyFromLocalDate(new Date(2026, 9, 3, 12, 0, 0))).toBe('2026-10-03')
    expect(dateKeyFromLocalDate(new Date(2026, 9, 3, 23, 59, 59, 999))).toBe(
      '2026-10-03',
    )
    expect(dateKeyFromLocalDate(new Date(2028, 1, 29, 18, 30))).toBe('2028-02-29')
  })

  it('rejects an invalid Date', () => {
    expect(() => dateKeyFromLocalDate(new Date(Number.NaN))).toThrow(
      expect.objectContaining({ code: 'invalid_date_parts' }),
    )
  })
})
