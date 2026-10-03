import { describe, expect, it } from 'vitest'
import { asDateKey, addDays } from '../time/dateKey'
import { summarizeDay, type DayQuality } from './dailyProgress'
import {
  applyDayToStreaks,
  buildDailySummary,
  foldStreaks,
  INITIAL_STREAK_STATE,
  isStreakSecured,
  projectedDailyStreak,
  streakEffectsOf,
  verifySummaryChain,
  type DailySummary,
} from './dailySummary'

const START = asDateKey('2026-10-01')

/** Builds a chain of finalized days from `[completed, eligible]` pairs, one per consecutive date. */
function chain(days: ReadonlyArray<readonly [number, number]>): DailySummary[] {
  const summaries: DailySummary[] = []
  days.forEach(([completed, eligible], index) => {
    const dateKey = addDays(START, index)
    summaries.push(
      buildDailySummary({
        dateKey,
        progress: summarizeDay(dateKey, completed, eligible),
        occurrenceIds: Array.from({ length: eligible }, (_, n) => `occ:q${n}@${dateKey}`),
        questExp: completed * 10,
        previous: summaries[index - 1] ?? null,
        finalizedAt: 1_000 + index,
        finalizedLate: false,
      }),
    )
  })
  return summaries
}

describe('streak effects by quality', () => {
  const table: ReadonlyArray<readonly [DayQuality, string, string]> = [
    ['perfect', 'increment', 'increment'],
    ['strong', 'increment', 'reset'],
    ['completed', 'increment', 'reset'],
    ['incomplete', 'reset', 'reset'],
    ['no_active_quests', 'neutral', 'neutral'],
  ]
  it.each(table)('%s → daily %s, perfect %s', (quality, daily, perfect) => {
    expect(streakEffectsOf(quality)).toEqual({ daily, perfect })
  })
})

describe('buildDailySummary', () => {
  it('captures the day and its streak effects for a perfect first day', () => {
    const [summary] = chain([[3, 3]])
    expect(summary).toMatchObject({
      dateKey: '2026-10-01',
      eligibleCount: 3,
      completedCount: 3,
      quality: 'perfect',
      isPerfect: true,
      dailyStreakEffect: 'increment',
      perfectStreakEffect: 'increment',
      questExp: 30,
      currentStreakAfter: 1,
      bestStreakAfter: 1,
      perfectStreakAfter: 1,
      finalizedLate: false,
    })
    expect(summary?.occurrenceIds).toHaveLength(3)
  })

  it('classifies by the exact ratio at the boundaries', () => {
    expect(chain([[69, 100]])[0]?.quality).toBe('incomplete')
    expect(chain([[70, 100]])[0]?.quality).toBe('completed')
    expect(chain([[84, 100]])[0]?.quality).toBe('completed')
    expect(chain([[85, 100]])[0]?.quality).toBe('strong')
    expect(chain([[99, 100]])[0]?.quality).toBe('strong')
    expect(chain([[100, 100]])[0]?.quality).toBe('perfect')
  })

  it('a no-active-quests day is neutral and never perfect', () => {
    const summary = chain([[0, 0]])[0]
    expect(summary).toMatchObject({
      quality: 'no_active_quests',
      isPerfect: false,
      eligibleCount: 0,
      dailyStreakEffect: 'neutral',
      perfectStreakEffect: 'neutral',
      currentStreakAfter: 0,
    })
    expect(summary?.occurrenceIds).toEqual([])
  })
})

describe('daily streak', () => {
  it('increments on ≥70 %, resets below 70 %, and tracks the best', () => {
    const days = chain([[7, 10], [8, 10], [9, 10], [6, 10], [7, 10]])
    expect(days.map((day) => day.currentStreakAfter)).toEqual([1, 2, 3, 0, 1])
    expect(days.map((day) => day.bestStreakAfter)).toEqual([1, 2, 3, 3, 3])
  })

  it('leaves the streak unchanged across a neutral day', () => {
    const days = chain([[7, 10], [0, 0], [7, 10]])
    expect(days.map((day) => day.currentStreakAfter)).toEqual([1, 1, 2])
    expect(days.map((day) => day.perfectStreakAfter)).toEqual([0, 0, 0])
  })

  it('a neutral day does not rescue or break a perfect streak either', () => {
    const days = chain([[3, 3], [0, 0], [3, 3]])
    expect(days.map((day) => day.perfectStreakAfter)).toEqual([1, 1, 2])
  })
})

describe('perfect days', () => {
  it('counts totals, grows the perfect streak and resets it on any non-perfect day', () => {
    const days = chain([[4, 4], [4, 4], [3, 4], [4, 4]])
    expect(days.map((day) => day.perfectStreakAfter)).toEqual([1, 2, 0, 1])
    // The daily streak survives the strong day.
    expect(days.map((day) => day.currentStreakAfter)).toEqual([1, 2, 3, 4])
    expect(foldStreaks(days)).toEqual({ currentStreak: 4, bestStreak: 4, perfectStreak: 1, totalPerfectDays: 3 })
  })

  it('total perfect days never decreases through an incomplete day', () => {
    const days = chain([[4, 4], [0, 4], [4, 4]])
    expect(foldStreaks(days).totalPerfectDays).toBe(2)
    expect(foldStreaks(days).currentStreak).toBe(1)
    expect(foldStreaks(days).bestStreak).toBe(1)
  })
})

describe('live projection (view only)', () => {
  it('projects the next streak from the live quality', () => {
    expect(projectedDailyStreak(4, 'completed')).toBe(5)
    expect(projectedDailyStreak(4, 'perfect')).toBe(5)
    expect(projectedDailyStreak(4, 'incomplete')).toBe(0)
    expect(projectedDailyStreak(4, 'no_active_quests')).toBe(4)
  })

  it('is secured from the Completed threshold up', () => {
    expect(isStreakSecured('incomplete')).toBe(false)
    expect(isStreakSecured('no_active_quests')).toBe(false)
    expect(isStreakSecured('completed')).toBe(true)
    expect(isStreakSecured('strong')).toBe(true)
    expect(isStreakSecured('perfect')).toBe(true)
  })

  it('does not mutate the persisted state', () => {
    const state = applyDayToStreaks(INITIAL_STREAK_STATE, 'perfect')
    projectedDailyStreak(state.currentStreak, 'incomplete')
    expect(state.currentStreak).toBe(1)
  })
})

describe('verifySummaryChain', () => {
  it('accepts a correct chain, including an empty one', () => {
    expect(verifySummaryChain([])).toEqual([])
    expect(verifySummaryChain(chain([[7, 10], [0, 0], [10, 10], [1, 10]]))).toEqual([])
  })

  it('reports a gap in the dates', () => {
    const days = chain([[7, 10], [7, 10], [7, 10]])
    const problems = verifySummaryChain([days[0]!, days[2]!])
    expect(problems.some((problem) => problem.code === 'not_contiguous' && problem.index === 1)).toBe(true)
  })

  it('reports a streak value that disagrees with the fold', () => {
    const days = chain([[7, 10], [7, 10]])
    const tampered = { ...days[1]!, currentStreakAfter: 5 }
    expect(verifySummaryChain([days[0]!, tampered])).toEqual([
      expect.objectContaining({ index: 1, field: 'currentStreakAfter', code: 'streak_mismatch' }),
    ])
  })
})
