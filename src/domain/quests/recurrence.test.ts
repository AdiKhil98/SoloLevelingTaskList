import { describe, expect, it } from 'vitest'
import { d } from '../test-utils/builders'
import { addDays } from '../time/dateKey'
import { checkQuestEligibility, isQuestEligibleOnDate } from './eligibility'
import { validateRecurrence } from './recurrence'
import { buildTemplate } from '../test-utils/builders'
import type { QuestRecurrence } from './types'

function eligible(recurrence: QuestRecurrence, date: string, overrides = {}) {
  return isQuestEligibleOnDate(buildTemplate({ recurrence, ...overrides }), d(date))
}

describe('daily recurrence', () => {
  it('is eligible on every ordinary date', () => {
    for (const date of ['2026-10-03', '2026-10-04', '2026-12-31', '2027-01-01', '2028-02-29']) {
      expect(eligible({ kind: 'daily' }, date)).toBe(true)
    }
  })
})

describe('selected-weekday recurrence', () => {
  const monWedFri: QuestRecurrence = { kind: 'weekdays', weekdays: [1, 3, 5] }

  it('is eligible on selected weekdays only', () => {
    // 2026-10-05 Monday … 2026-10-11 Sunday
    expect(eligible(monWedFri, '2026-10-05')).toBe(true) // Mon
    expect(eligible(monWedFri, '2026-10-06')).toBe(false) // Tue
    expect(eligible(monWedFri, '2026-10-07')).toBe(true) // Wed
    expect(eligible(monWedFri, '2026-10-08')).toBe(false) // Thu
    expect(eligible(monWedFri, '2026-10-09')).toBe(true) // Fri
    expect(eligible(monWedFri, '2026-10-10')).toBe(false) // Sat
    expect(eligible(monWedFri, '2026-10-11')).toBe(false) // Sun
  })

  it('supports Sunday (7) as a selectable weekday', () => {
    expect(eligible({ kind: 'weekdays', weekdays: [7] }, '2026-10-11')).toBe(true)
    expect(eligible({ kind: 'weekdays', weekdays: [7] }, '2026-10-12')).toBe(false)
  })
})

describe('interval recurrence', () => {
  const everyTwo: QuestRecurrence = {
    kind: 'interval',
    everyNDays: 2,
    anchor: d('2026-10-01'),
  }

  it('includes the anchor itself', () => {
    expect(eligible(everyTwo, '2026-10-01')).toBe(true)
  })

  it('is eligible on later multiples of the interval and not in between', () => {
    expect(eligible(everyTwo, '2026-10-03')).toBe(true)
    expect(eligible(everyTwo, '2026-10-05')).toBe(true)
    expect(eligible(everyTwo, '2026-10-02')).toBe(false)
    expect(eligible(everyTwo, '2026-10-04')).toBe(false)
  })

  it('is not eligible before the anchor, even on matching offsets', () => {
    expect(eligible(everyTwo, '2026-09-29')).toBe(false)
    expect(eligible(everyTwo, '2026-09-30')).toBe(false)
    expect(eligible(everyTwo, '2026-09-01')).toBe(false)
  })

  it('stays anchored across month and year boundaries', () => {
    expect(eligible(everyTwo, '2026-10-31')).toBe(true) // +30
    expect(eligible(everyTwo, '2026-11-01')).toBe(false)
    expect(eligible(everyTwo, '2026-11-02')).toBe(true) // +32
    const everyThree: QuestRecurrence = {
      kind: 'interval',
      everyNDays: 3,
      anchor: d('2026-12-30'),
    }
    expect(eligible(everyThree, '2027-01-02')).toBe(true) // +3
    expect(eligible(everyThree, '2027-01-01')).toBe(false)
    expect(eligible(everyThree, '2027-01-05')).toBe(true) // +6
  })

  it('does not shift when earlier occurrences are skipped (anchor-based)', () => {
    // Eligibility is a pure function of the date: never of what happened before.
    expect(eligible(everyTwo, '2026-10-07')).toBe(true)
    expect(eligible(everyTwo, '2026-10-08')).toBe(false)
  })

  it('handles a long interval across a leap day', () => {
    const everyTen: QuestRecurrence = {
      kind: 'interval',
      everyNDays: 10,
      anchor: d('2028-02-20'),
    }
    expect(eligible(everyTen, '2028-03-01')).toBe(true) // 2028-02-29 is day +9
    expect(eligible(everyTen, '2028-02-29')).toBe(false)
  })

  it('matches exactly the dates produced by stepping the interval', () => {
    const anchor = d('2026-10-01')
    const hits = new Set<string>()
    for (let step = 0; step < 8; step += 1) hits.add(addDays(anchor, step * 7))
    for (let offset = -5; offset < 45; offset += 1) {
      const date = addDays(anchor, offset)
      expect(eligible({ kind: 'interval', everyNDays: 7, anchor }, date)).toBe(
        hits.has(date),
      )
    }
  })
})

describe('one-time recurrence', () => {
  const once: QuestRecurrence = { kind: 'one_time', date: d('2026-10-10') }

  it('is eligible on its exact date only', () => {
    expect(eligible(once, '2026-10-10')).toBe(true)
  })

  it('is not eligible the day before or after, so a missed quest never carries over', () => {
    expect(eligible(once, '2026-10-09')).toBe(false)
    expect(eligible(once, '2026-10-11')).toBe(false)
    expect(eligible(once, '2026-10-17')).toBe(false)
  })
})

describe('active period', () => {
  it('limits eligibility to activeFrom … activeUntil inclusive', () => {
    const template = buildTemplate({
      activeFrom: d('2026-10-05'),
      activeUntil: d('2026-10-07'),
    })
    expect(checkQuestEligibility(template, d('2026-10-04'))).toEqual({
      eligible: false,
      reason: 'before_active_from',
    })
    expect(checkQuestEligibility(template, d('2026-10-05')).eligible).toBe(true)
    expect(checkQuestEligibility(template, d('2026-10-07')).eligible).toBe(true)
    expect(checkQuestEligibility(template, d('2026-10-08'))).toEqual({
      eligible: false,
      reason: 'after_active_until',
    })
  })

  it('reports a recurrence mismatch inside the active period', () => {
    const template = buildTemplate({ recurrence: { kind: 'weekdays', weekdays: [1] } })
    expect(checkQuestEligibility(template, d('2026-10-06'))).toEqual({
      eligible: false,
      reason: 'recurrence_mismatch',
    })
  })
})

describe('eligibility depends only on the template and the date', () => {
  it('is deterministic for repeated calls', () => {
    const template = buildTemplate({ recurrence: { kind: 'weekdays', weekdays: [2, 4] } })
    const results = Array.from({ length: 5 }, () =>
      isQuestEligibleOnDate(template, d('2026-10-06')),
    )
    expect(new Set(results)).toEqual(new Set([true]))
  })

  it('throws instead of guessing when the recurrence is malformed', () => {
    const template = buildTemplate({
      recurrence: { kind: 'interval', everyNDays: 0, anchor: d('2026-10-01') },
    })
    expect(() => isQuestEligibleOnDate(template, d('2026-10-01'))).toThrow(
      expect.objectContaining({ code: 'invalid_recurrence' }),
    )
  })
})

describe('validateRecurrence', () => {
  it('accepts every well-formed shape', () => {
    expect(validateRecurrence({ kind: 'daily' }).ok).toBe(true)
    expect(validateRecurrence({ kind: 'weekdays', weekdays: [1, 7] }).ok).toBe(true)
    expect(
      validateRecurrence({ kind: 'interval', everyNDays: 2, anchor: '2026-10-01' }).ok,
    ).toBe(true)
    expect(validateRecurrence({ kind: 'one_time', date: '2028-02-29' }).ok).toBe(true)
  })

  it.each([
    ['interval of zero', { kind: 'interval', everyNDays: 0, anchor: '2026-10-01' }, 'interval_too_small'],
    ['negative interval', { kind: 'interval', everyNDays: -3, anchor: '2026-10-01' }, 'interval_too_small'],
    ['interval of one (that is daily)', { kind: 'interval', everyNDays: 1, anchor: '2026-10-01' }, 'interval_too_small'],
    ['fractional interval', { kind: 'interval', everyNDays: 2.5, anchor: '2026-10-01' }, 'interval_not_integer'],
    ['NaN interval', { kind: 'interval', everyNDays: Number.NaN, anchor: '2026-10-01' }, 'interval_not_integer'],
    ['string interval', { kind: 'interval', everyNDays: '2', anchor: '2026-10-01' }, 'interval_not_integer'],
    ['impossible anchor', { kind: 'interval', everyNDays: 2, anchor: '2026-02-30' }, 'invalid_anchor'],
    ['missing anchor', { kind: 'interval', everyNDays: 2 }, 'invalid_anchor'],
    ['empty weekday selection', { kind: 'weekdays', weekdays: [] }, 'weekdays_empty'],
    ['missing weekdays', { kind: 'weekdays' }, 'weekdays_not_array'],
    ['weekday 0', { kind: 'weekdays', weekdays: [0] }, 'weekday_out_of_range'],
    ['weekday 8', { kind: 'weekdays', weekdays: [1, 8] }, 'weekday_out_of_range'],
    ['fractional weekday', { kind: 'weekdays', weekdays: [1.5] }, 'weekday_out_of_range'],
    ['duplicate weekday', { kind: 'weekdays', weekdays: [2, 2] }, 'weekday_duplicate'],
    ['impossible one-time date', { kind: 'one_time', date: '2027-02-29' }, 'invalid_one_time_date'],
    ['malformed one-time date', { kind: 'one_time', date: 'tomorrow' }, 'invalid_one_time_date'],
    ['unknown kind', { kind: 'monthly' }, 'unknown_kind'],
    ['missing kind', {}, 'unknown_kind'],
    ['null', null, 'not_an_object'],
    ['a string', 'daily', 'not_an_object'],
  ])('rejects %s', (_label, input, code) => {
    const result = validateRecurrence(input)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe(code)
  })

  it('returns a copy so later mutation of the input cannot change it', () => {
    const weekdays = [1, 2]
    const result = validateRecurrence({ kind: 'weekdays', weekdays })
    weekdays.push(3)
    expect(result.ok && result.value.kind === 'weekdays' && result.value.weekdays).toEqual([1, 2])
  })
})
