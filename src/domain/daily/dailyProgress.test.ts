import { describe, expect, it } from 'vitest'
import { buildOccurrence, d } from '../test-utils/builders'
import {
  classifyDayQuality,
  computeDailyProgress,
  displayPercentOf,
  summarizeDay,
} from './dailyProgress'

describe('classifyDayQuality', () => {
  it('classifies a day with no eligible quests as no_active_quests, not 0 % or Perfect', () => {
    expect(classifyDayQuality(0, 0)).toBe('no_active_quests')
    expect(displayPercentOf(0, 0)).toBeNull()
  })

  it.each([
    [0, 10, 'incomplete', 0],
    [6, 10, 'incomplete', 60],
    [7, 10, 'completed', 70],
    [8, 10, 'completed', 80],
    [9, 10, 'strong', 90],
    [10, 10, 'perfect', 100],
  ] as const)('%i/%i is %s (%i%%)', (done, total, quality, percent) => {
    expect(classifyDayQuality(done, total)).toBe(quality)
    expect(displayPercentOf(done, total)).toBe(percent)
  })

  it('works with other denominators', () => {
    expect(classifyDayQuality(1, 1)).toBe('perfect')
    expect(classifyDayQuality(0, 1)).toBe('incomplete')
    expect(classifyDayQuality(1, 2)).toBe('incomplete') // 50 %
    expect(classifyDayQuality(2, 3)).toBe('incomplete') // 66.7 %
    expect(classifyDayQuality(3, 4)).toBe('completed') // 75 %
    expect(classifyDayQuality(4, 5)).toBe('completed') // 80 %
    expect(classifyDayQuality(5, 6)).toBe('completed') // 83.3 %
    expect(classifyDayQuality(6, 7)).toBe('strong') // 85.7 %
    expect(classifyDayQuality(13, 20)).toBe('incomplete') // 65 %
    expect(classifyDayQuality(14, 20)).toBe('completed') // 70 %
    expect(classifyDayQuality(17, 20)).toBe('strong') // 85 %
  })

  it('classifies from the exact ratio, not the rounded percentage', () => {
    // 174 / 250 = 69.6 %: would round to 70 % but is Incomplete, and displays 69.
    expect(classifyDayQuality(174, 250)).toBe('incomplete')
    expect(displayPercentOf(174, 250)).toBe(69)
    // 175 / 250 = exactly 70 %.
    expect(classifyDayQuality(175, 250)).toBe('completed')
    expect(displayPercentOf(175, 250)).toBe(70)
  })

  it('places the 85 % boundary exactly, with integer counts', () => {
    expect(classifyDayQuality(84, 100)).toBe('completed') // 84 %
    expect(classifyDayQuality(85, 100)).toBe('strong') // exactly 85 %
    expect(classifyDayQuality(169, 200)).toBe('completed') // 84.5 %
    expect(classifyDayQuality(170, 200)).toBe('strong')
    // 84.9 % displays as 84 and is not Strong.
    expect(classifyDayQuality(849, 1000)).toBe('completed')
    expect(displayPercentOf(849, 1000)).toBe(84)
    expect(classifyDayQuality(850, 1000)).toBe('strong')
  })

  it('never reports Perfect or 100 % until every eligible quest is done', () => {
    expect(classifyDayQuality(999, 1000)).toBe('strong') // 99.9 %
    expect(displayPercentOf(999, 1000)).toBe(99)
    expect(displayPercentOf(1000, 1000)).toBe(100)
  })

  it('rejects impossible counts', () => {
    for (const [done, total] of [[-1, 5], [6, 5], [1.5, 4], [1, Number.NaN], [0, -1]] as const) {
      expect(() => classifyDayQuality(done, total)).toThrow(
        expect.objectContaining({ code: 'invalid_count' }),
      )
    }
  })
})

describe('displayPercentOf', () => {
  it('floors and never rounds', () => {
    expect(displayPercentOf(1, 3)).toBe(33)
    expect(displayPercentOf(2, 3)).toBe(66)
    expect(displayPercentOf(1, 6)).toBe(16)
    expect(displayPercentOf(5, 7)).toBe(71)
  })
})

describe('summarizeDay', () => {
  it('bundles counts, quality and display percentage', () => {
    expect(summarizeDay(d('2026-10-03'), 7, 10)).toEqual({
      dateKey: '2026-10-03',
      eligibleCount: 10,
      completedCount: 7,
      quality: 'completed',
      displayPercent: 70,
    })
  })
})

describe('computeDailyProgress', () => {
  const day = d('2026-10-03')
  const occ = (id: string, difficulty: 'E' | 'S') => buildOccurrence({ id, difficulty }, day)

  it('counts quests, not EXP: a 120 EXP quest and a 10 EXP quest weigh the same', () => {
    const occurrences = [occ('a', 'S'), occ('b', 'E')]
    const heavyDone = computeDailyProgress({
      dateKey: day,
      occurrences,
      completedOccurrenceIds: new Set([occurrences[0]!.id]),
    })
    const lightDone = computeDailyProgress({
      dateKey: day,
      occurrences,
      completedOccurrenceIds: new Set([occurrences[1]!.id]),
    })
    expect(heavyDone).toEqual(lightDone)
    expect(heavyDone.ok && heavyDone.value).toMatchObject({
      eligibleCount: 2,
      completedCount: 1,
      displayPercent: 50,
      quality: 'incomplete',
    })
  })

  it('reports an empty day as no_active_quests', () => {
    const result = computeDailyProgress({
      dateKey: day,
      occurrences: [],
      completedOccurrenceIds: new Set(),
    })
    expect(result.ok && result.value).toMatchObject({
      eligibleCount: 0,
      completedCount: 0,
      quality: 'no_active_quests',
      displayPercent: null,
    })
  })

  it('computes 7 of 10 as Completed', () => {
    const occurrences = Array.from({ length: 10 }, (_, i) => occ(`q${i}`, 'E'))
    const done = new Set(occurrences.slice(0, 7).map((o) => o.id))
    const result = computeDailyProgress({
      dateKey: day,
      occurrences,
      completedOccurrenceIds: done,
    })
    expect(result.ok && result.value).toMatchObject({
      completedCount: 7,
      eligibleCount: 10,
      quality: 'completed',
      displayPercent: 70,
    })
  })

  it('ignores completed ids that match no occurrence of the day', () => {
    const occurrences = [occ('a', 'E')]
    const result = computeDailyProgress({
      dateKey: day,
      occurrences,
      completedOccurrenceIds: new Set(['occ:ghost@2026-10-03']),
    })
    expect(result.ok && result.value.completedCount).toBe(0)
  })

  it('rejects occurrences from another date and duplicate occurrences', () => {
    const wrongDay = buildOccurrence({ id: 'a' }, d('2026-10-04'))
    expect(
      computeDailyProgress({ dateKey: day, occurrences: [wrongDay], completedOccurrenceIds: new Set() }),
    ).toEqual({
      ok: false,
      error: {
        code: 'occurrence_date_mismatch',
        occurrenceId: wrongDay.id,
        occurrenceDate: '2026-10-04',
      },
    })

    const one = occ('a', 'E')
    expect(
      computeDailyProgress({ dateKey: day, occurrences: [one, one], completedOccurrenceIds: new Set() }),
    ).toEqual({ ok: false, error: { code: 'duplicate_occurrence', occurrenceId: one.id } })
  })
})
