import { describe, expect, it } from 'vitest'
import { DomainError } from '../types/errors'
import { addDays, asDateKey } from './dateKey'
import {
  asWeekKey,
  isDateInWeek,
  isWeekKey,
  nextWeekKey,
  previousWeekKey,
  weekEndOf,
  weekKeyOf,
} from './weekKey'

const d = asDateKey

describe('weekKeyOf (the Monday of the week)', () => {
  it.each([
    ['2026-10-05', '2026-10-05'], // Monday maps to itself
    ['2026-10-06', '2026-10-05'],
    ['2026-10-09', '2026-10-05'],
    ['2026-10-11', '2026-10-05'], // Sunday belongs to the week that STARTED on Monday
    ['2026-10-12', '2026-10-12'], // the next Monday starts a new week
  ])('%s → %s', (date, monday) => {
    expect(weekKeyOf(d(date))).toBe(monday)
  })

  it('handles a week that crosses the year boundary (no ISO week numbers)', () => {
    // 2026-12-28 is a Monday; the week ends Sunday 2027-01-03.
    for (const date of ['2026-12-28', '2026-12-31', '2027-01-01', '2027-01-03']) {
      expect(weekKeyOf(d(date))).toBe('2026-12-28')
    }
    expect(weekEndOf(asWeekKey('2026-12-28'))).toBe('2027-01-03')
    expect(weekKeyOf(d('2027-01-04'))).toBe('2027-01-04')
  })

  it('handles a leap day and month ends', () => {
    // 2028-02-28 is a Monday; 2028-02-29 exists.
    expect(weekKeyOf(d('2028-02-29'))).toBe('2028-02-28')
    expect(weekEndOf(asWeekKey('2028-02-28'))).toBe('2028-03-05')
    expect(weekKeyOf(d('2026-03-01'))).toBe('2026-02-23')
  })

  it('is plain calendar arithmetic, so a daylight-saving week is still seven dates', () => {
    // Europe/Berlin springs forward on Sunday 2026-03-29; the week of 2026-03-23 still ends 03-29.
    expect(weekEndOf(asWeekKey('2026-03-23'))).toBe('2026-03-29')
    expect(weekKeyOf(d('2026-03-29'))).toBe('2026-03-23')
    expect(weekKeyOf(d('2026-03-30'))).toBe('2026-03-30')
    // And the autumn change (Sunday 2026-10-25).
    expect(weekEndOf(asWeekKey('2026-10-19'))).toBe('2026-10-25')
  })

  it('every date of 400 consecutive weeks lands in exactly the week that contains it', () => {
    let monday = asWeekKey('2026-01-05')
    for (let week = 0; week < 400; week += 1) {
      const sunday = weekEndOf(monday)
      let date = monday
      for (let day = 0; day < 7; day += 1) {
        expect(weekKeyOf(date)).toBe(monday)
        expect(isDateInWeek(date, monday)).toBe(true)
        date = addDays(date, 1)
      }
      expect(isDateInWeek(sunday, monday)).toBe(true)
      expect(isDateInWeek(date, monday)).toBe(false) // the next Monday is outside
      monday = nextWeekKey(monday)
    }
  })
})

describe('week key helpers', () => {
  it('walks to the neighbouring weeks', () => {
    const week = asWeekKey('2026-10-05')
    expect(nextWeekKey(week)).toBe('2026-10-12')
    expect(previousWeekKey(week)).toBe('2026-09-28')
    expect(previousWeekKey(nextWeekKey(week))).toBe(week)
  })

  it('isWeekKey accepts only valid Mondays', () => {
    expect(isWeekKey('2026-10-05')).toBe(true)
    expect(isWeekKey('2026-10-06')).toBe(false) // a Tuesday
    expect(isWeekKey('2026-10-11')).toBe(false) // a Sunday
    expect(isWeekKey('2026-02-30')).toBe(false) // not a date
    expect(isWeekKey('nope')).toBe(false)
    expect(isWeekKey(20261005)).toBe(false)
    expect(isWeekKey(null)).toBe(false)
  })

  it('asWeekKey throws a DomainError for a non-Monday or a malformed date', () => {
    expect(asWeekKey('2026-10-05')).toBe('2026-10-05')
    expect(() => asWeekKey('2026-10-06')).toThrow(DomainError)
    expect(() => asWeekKey('2026-13-01')).toThrow(DomainError)
  })

  it('isDateInWeek includes both ends and excludes the neighbours', () => {
    const week = asWeekKey('2026-10-05')
    expect(isDateInWeek(d('2026-10-04'), week)).toBe(false)
    expect(isDateInWeek(d('2026-10-05'), week)).toBe(true)
    expect(isDateInWeek(d('2026-10-11'), week)).toBe(true)
    expect(isDateInWeek(d('2026-10-12'), week)).toBe(false)
  })
})
