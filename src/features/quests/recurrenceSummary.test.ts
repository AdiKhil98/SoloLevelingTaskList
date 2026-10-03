import { describe, expect, it } from 'vitest'
import { asDateKey, type QuestRecurrence } from '@/domain'
import { difficultyLabel, difficultyName, weekdayName, weekdayShortName } from '../displayLabels'
import { formatDateKey, recurrenceListText, recurrenceSummary } from './recurrenceSummary'

describe('formatDateKey', () => {
  it.each([
    ['2026-10-08', 'Oct 8, 2026'],
    ['2026-01-01', 'Jan 1, 2026'],
    ['2028-02-29', 'Feb 29, 2028'],
    ['2026-12-31', 'Dec 31, 2026'],
  ])('%s → %s', (key, text) => {
    expect(formatDateKey(asDateKey(key))).toBe(text)
  })
})

describe('recurrenceSummary', () => {
  const cases: [QuestRecurrence, string, string][] = [
    [{ kind: 'daily' }, 'Daily', 'Daily'],
    [{ kind: 'weekdays', weekdays: [1, 3, 5] }, 'Mon, Wed, Fri', 'Scheduled · Mon, Wed, Fri'],
    [{ kind: 'weekdays', weekdays: [7, 1] }, 'Mon, Sun', 'Scheduled · Mon, Sun'],
    [{ kind: 'weekdays', weekdays: [1, 2, 3, 4, 5, 6, 7] }, 'Mon, Tue, Wed, Thu, Fri, Sat, Sun', 'Scheduled · Mon, Tue, Wed, Thu, Fri, Sat, Sun'],
    [{ kind: 'interval', everyNDays: 2, anchor: asDateKey('2026-10-03') }, 'Every 2 days', 'Scheduled · Every 2 days'],
    [{ kind: 'one_time', date: asDateKey('2026-10-08') }, 'One-time · Oct 8, 2026', 'One-time · Oct 8, 2026'],
  ]

  it.each(cases)('describes %j', (recurrence, summary, listText) => {
    expect(recurrenceSummary(recurrence)).toBe(summary)
    expect(recurrenceListText(recurrence)).toBe(listText)
  })
})

describe('labels', () => {
  it('names every difficulty', () => {
    expect(['E', 'D', 'C', 'B', 'A', 'S'].map((d) => difficultyName(d as 'E'))).toEqual([
      'Trivial',
      'Easy',
      'Normal',
      'Hard',
      'Very Hard',
      'Major',
    ])
    expect(difficultyLabel('B')).toBe('B — Hard')
  })

  it('names the weekdays', () => {
    expect(([1, 2, 3, 4, 5, 6, 7] as const).map(weekdayName)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
    expect(weekdayShortName(3)).toBe('Wed')
  })
})
