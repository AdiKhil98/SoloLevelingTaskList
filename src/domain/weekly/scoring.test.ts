import { describe, expect, it } from 'vitest'
import {
  WEEKLY_BONUS_EXP,
  WEEKLY_REWARD_TIER_SCORES,
  isWeeklyRewardTierScore,
  weeklyBonusExpForScore,
} from '../config/weekly'
import { evaluateWeeklyGoals, goalProgressOf, isGoalComplete, rewardTierForScore, type LinkedCompletionCounts } from './scoring'
import { goal, TIERS } from './testFixtures'

const noCounts: LinkedCompletionCounts = new Map()

describe('weekly bonus EXP (a lookup, never cumulative)', () => {
  it.each([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
    [5, 0],
    [6, 100],
    [7, 150],
    [8, 225],
    [9, 325],
    [10, 500],
  ])('%i / 10 → %i EXP', (score, bonus) => {
    expect(weeklyBonusExpForScore(score)).toBe(bonus)
    expect(WEEKLY_BONUS_EXP[score]).toBe(bonus)
  })

  it('9 / 10 is 325, not 100 + 150 + 225 + 325', () => {
    expect(weeklyBonusExpForScore(9)).toBe(325)
    expect(weeklyBonusExpForScore(9)).not.toBe(100 + 150 + 225 + 325)
  })

  it('has exactly eleven entries, never decreasing', () => {
    expect(WEEKLY_BONUS_EXP).toHaveLength(11)
    for (let score = 1; score <= 10; score += 1) expect(WEEKLY_BONUS_EXP[score]).toBeGreaterThanOrEqual(WEEKLY_BONUS_EXP[score - 1]!)
  })

  it.each([[-1], [11], [6.5], [Number.NaN]])('earns nothing for the impossible score %s', (score) => {
    expect(weeklyBonusExpForScore(score)).toBe(0)
  })
})

describe('goal completion', () => {
  it('is reached at the target, not below', () => {
    expect(isGoalComplete(19, 20)).toBe(false)
    expect(isGoalComplete(20, 20)).toBe(true)
  })

  it('is not increased by progress above the target', () => {
    const [result] = evaluateWeeklyGoals([goal({ id: 'wg_a', maxPoints: 3, target: 20, manualProgress: 25 })], noCounts).goalResults
    expect(result).toMatchObject({ finalProgress: 25, completed: true, earnedPoints: 3 }) // 3 points, not more
  })

  it('is all-or-nothing: 19 of 20 earns nothing', () => {
    const evaluation = evaluateWeeklyGoals([goal({ id: 'wg_a', maxPoints: 3, target: 20, manualProgress: 19 })], noCounts)
    expect(evaluation.score).toBe(0)
    expect(evaluation.goalResults[0]).toMatchObject({ completed: false, earnedPoints: 0 })
  })
})

describe('manual and linked progress', () => {
  it('reads the player’s number for a manual goal', () => {
    expect(goalProgressOf(goal({ id: 'wg_a', manualProgress: 14 }), new Map([['tpl_x', 99]]))).toBe(14)
  })

  it('reads the template’s completion count for a linked goal, and 0 when there is none', () => {
    const linked = goal({ id: 'wg_a', tracking: { mode: 'linked_quest', templateId: 'tpl_gym' }, manualProgress: 7 })
    expect(goalProgressOf(linked, new Map([['tpl_gym', 3]]))).toBe(3) // the stored manual value is ignored
    expect(goalProgressOf(linked, new Map([['tpl_other', 5]]))).toBe(0) // a different template does not count
    expect(goalProgressOf(linked, noCounts)).toBe(0)
  })
})

describe('the weekly score', () => {
  const board = [
    goal({ id: 'wg_a', maxPoints: 3, target: 2, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }),
    goal({ id: 'wg_b', maxPoints: 3, target: 20, manualProgress: 20 }),
    goal({ id: 'wg_c', maxPoints: 2, target: 4, manualProgress: 3 }),
    goal({ id: 'wg_d', maxPoints: 1, target: 1, manualProgress: 1 }),
    goal({ id: 'wg_e', maxPoints: 1, target: 1, manualProgress: 0 }),
  ]

  it('is the sum of the points of the achieved goals', () => {
    const evaluation = evaluateWeeklyGoals(board, new Map([['tpl_gym', 2]]))
    expect(evaluation.goalResults.map((result) => [result.goalId, result.earnedPoints])).toEqual([
      ['wg_a', 3],
      ['wg_b', 3],
      ['wg_c', 0], // 3 of 4 is not enough
      ['wg_d', 1],
      ['wg_e', 0],
    ])
    expect(evaluation.score).toBe(7)
    expect(evaluation.goalsCompleted).toBe(3)
  })

  it('covers every score from 0 to 10 by completing a growing prefix of ten one-point goals', () => {
    for (let done = 0; done <= 10; done += 1) {
      const goals = Array.from({ length: 10 }, (_, index) => goal({ id: `wg_${index}`, maxPoints: 1, manualProgress: index < done ? 1 : 0 }))
      const evaluation = evaluateWeeklyGoals(goals, noCounts)
      expect(evaluation.score).toBe(done)
      expect(weeklyBonusExpForScore(evaluation.score)).toBe(WEEKLY_BONUS_EXP[done])
    }
  })

  it('freezes what it scored in each result (trackingMode, template, progress, unit)', () => {
    const [linked] = evaluateWeeklyGoals([goal({ id: 'wg_a', unit: 'sessions', tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } })], new Map([['tpl_gym', 4]])).goalResults
    expect(linked).toEqual({
      goalId: 'wg_a',
      title: 'Goal wg_a',
      unit: 'sessions',
      maxPoints: 1,
      target: 1,
      trackingMode: 'linked_quest',
      templateId: 'tpl_gym',
      finalProgress: 4,
      completed: true,
      earnedPoints: 1,
    })
  })
})

describe('reward tiers (only the highest achieved tier applies)', () => {
  it('is null below 6', () => {
    for (const score of [0, 1, 5]) expect(rewardTierForScore(score, TIERS)).toBeNull()
  })

  it.each([
    [6, 6],
    [7, 7],
    [8, 8],
    [9, 9],
    [10, 10],
  ])('a score of %i earns the %i tier', (score, minScore) => {
    expect(rewardTierForScore(score, TIERS)?.minScore).toBe(minScore)
  })

  it('returns the tier with the text it was configured with, not a stacked list', () => {
    expect(rewardTierForScore(9, TIERS)).toEqual({ minScore: 9, text: 'Budgeted purchase' })
  })

  it('does not depend on the order the tiers are listed in', () => {
    expect(rewardTierForScore(8, [...TIERS].reverse())?.minScore).toBe(8)
  })

  it('exposes exactly the approved tier scores', () => {
    expect([...WEEKLY_REWARD_TIER_SCORES]).toEqual([6, 7, 8, 9, 10])
    expect(isWeeklyRewardTierScore(8)).toBe(true)
    expect(isWeeklyRewardTierScore(5)).toBe(false)
    expect(isWeeklyRewardTierScore('8')).toBe(false)
  })
})
