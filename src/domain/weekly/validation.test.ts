import { describe, expect, it } from 'vitest'
import { WEEKLY_BOARD_TOTAL_POINTS, WEEKLY_LIMITS } from '../config/weekly'
import { definition, goal, TIERS } from './testFixtures'
import type { WeeklyBoardDefinition } from './types'
import { validateWeeklyBoardDefinition } from './validation'

const codes = (value: WeeklyBoardDefinition) => validateWeeklyBoardDefinition(value).map((problem) => problem.code)

/** A board whose goals carry exactly these weights. */
function weighted(...points: number[]): WeeklyBoardDefinition {
  return definition({ goals: points.map((maxPoints, index) => goal({ id: `wg_${index}`, maxPoints })) })
}

describe('the exactly-10 rule', () => {
  it('requires a total of exactly ten points', () => {
    expect(WEEKLY_BOARD_TOTAL_POINTS).toBe(10)
  })

  it.each([
    [[3, 3, 2, 1, 1]],
    [[4, 3, 2, 1]],
    [[5, 3, 2]],
    [[10]],
    [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1]],
    [[6, 4]],
  ])('accepts the valid weighting %j', (points) => {
    expect(validateWeeklyBoardDefinition(weighted(...points))).toEqual([])
  })

  it.each([
    [[3, 3, 2, 1], 9],
    [[4, 3, 2], 9],
    [[1], 1],
    [[5, 4], 9],
  ])('rejects %j (total %i) as below ten', (points, total) => {
    expect(validateWeeklyBoardDefinition(weighted(...points))).toContainEqual({ code: 'points_total_invalid', total })
  })

  it.each([
    [[3, 3, 2, 1, 2], 11],
    [[5, 5, 1], 11],
    [[6, 6], 12],
  ])('rejects %j (total %i) as above ten', (points, total) => {
    expect(validateWeeklyBoardDefinition(weighted(...points))).toContainEqual({ code: 'points_total_invalid', total })
  })

  it('rejects an empty board', () => {
    const problems = codes(definition({ goals: [] }))
    expect(problems).toContain('no_goals')
    expect(problems).not.toContain('points_total_invalid') // nothing to total; no_goals says it
  })

  it('rejects a goal that alone exceeds ten', () => {
    expect(codes(weighted(11))).toContain('goal_points_invalid')
  })

  it.each([[0], [-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])('rejects the weight %s (whole points ≥ 1 only: no fractions)', (maxPoints) => {
    const problems = validateWeeklyBoardDefinition(definition({ goals: [goal({ id: 'wg_x', maxPoints }), goal({ id: 'wg_y', maxPoints: 9 })] }))
    expect(problems).toContainEqual({ code: 'goal_points_invalid', goalId: 'wg_x' })
    // An invalid weight reports itself instead of skewing the total.
    expect(problems.map((problem) => problem.code)).not.toContain('points_total_invalid')
  })
})

describe('goal fields', () => {
  const with_ = (overrides: Parameters<typeof goal>[0]) => definition({ goals: [goal({ ...overrides, maxPoints: 10 })] })

  it('requires a title', () => {
    expect(validateWeeklyBoardDefinition(with_({ id: 'wg_t', title: '   ' }))).toContainEqual({ code: 'goal_title_required', goalId: 'wg_t' })
  })

  it('limits the title, unit, notes and focus lengths', () => {
    expect(codes(with_({ id: 'wg_t', title: 'x'.repeat(WEEKLY_LIMITS.goalTitleMaxLength + 1) }))).toContain('goal_title_too_long')
    expect(codes(with_({ id: 'wg_t', title: 'x'.repeat(WEEKLY_LIMITS.goalTitleMaxLength) }))).toEqual([])
    expect(codes(with_({ id: 'wg_t', unit: 'u'.repeat(WEEKLY_LIMITS.unitMaxLength + 1) }))).toContain('goal_unit_too_long')
    expect(codes(with_({ id: 'wg_t', notes: 'n'.repeat(WEEKLY_LIMITS.notesMaxLength + 1) }))).toContain('goal_notes_too_long')
    expect(codes(definition({ focus: 'f'.repeat(WEEKLY_LIMITS.focusMaxLength + 1) }))).toContain('focus_too_long')
  })

  it.each([[0], [-3], [2.5], [WEEKLY_LIMITS.targetMax + 1]])('rejects the target %s', (target) => {
    expect(codes(with_({ id: 'wg_t', target }))).toContain('goal_target_invalid')
  })

  it('accepts a target of 1 (a yes/no goal) up to the limit', () => {
    expect(codes(with_({ id: 'wg_t', target: 1 }))).toEqual([])
    expect(codes(with_({ id: 'wg_t', target: WEEKLY_LIMITS.targetMax }))).toEqual([])
  })

  it.each([[-1], [1.5], [WEEKLY_LIMITS.progressMax + 1]])('rejects the manual progress %s', (manualProgress) => {
    expect(codes(with_({ id: 'wg_t', manualProgress }))).toContain('goal_progress_invalid')
  })

  it('requires a linked goal to name a quest', () => {
    expect(codes(with_({ id: 'wg_t', tracking: { mode: 'linked_quest', templateId: ' ' } }))).toContain('goal_link_missing')
    expect(codes(with_({ id: 'wg_t', tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }))).toEqual([])
  })

  it('rejects a blank or duplicated goal id', () => {
    expect(codes(definition({ goals: [goal({ id: ' ', maxPoints: 10 })] }))).toContain('goal_id_invalid')
    const duplicated = definition({ goals: [goal({ id: 'wg_same', maxPoints: 5 }), goal({ id: 'wg_same', maxPoints: 5 })] })
    expect(validateWeeklyBoardDefinition(duplicated)).toContainEqual({ code: 'duplicate_goal_id', goalId: 'wg_same' })
  })

  it('reports every problem together, not just the first', () => {
    const problems = codes(definition({ goals: [goal({ id: 'wg_a', title: '', maxPoints: 4, target: 0 })] }))
    expect(problems).toEqual(expect.arrayContaining(['goal_title_required', 'goal_target_invalid', 'points_total_invalid']))
  })
})

describe('reward tiers', () => {
  it('requires exactly one tier each for 6, 7, 8, 9 and 10, in order', () => {
    expect(codes(definition({ rewardTiers: TIERS }))).toEqual([])
    expect(codes(definition({ rewardTiers: TIERS.slice(0, 4) }))).toContain('reward_tiers_invalid')
    expect(codes(definition({ rewardTiers: [...TIERS].reverse() }))).toContain('reward_tiers_invalid')
    expect(codes(definition({ rewardTiers: [TIERS[0]!, TIERS[0]!, TIERS[2]!, TIERS[3]!, TIERS[4]!] }))).toContain('reward_tiers_invalid')
  })

  it('allows empty reward text (no reward configured) but limits its length', () => {
    expect(codes(definition({ rewardTiers: TIERS.map((tier) => ({ ...tier, text: '' })) }))).toEqual([])
    const long = TIERS.map((tier) => (tier.minScore === 8 ? { ...tier, text: 'x'.repeat(WEEKLY_LIMITS.rewardTextMaxLength + 1) } : tier))
    expect(validateWeeklyBoardDefinition(definition({ rewardTiers: long }))).toContainEqual({ code: 'reward_text_too_long', minScore: 8 })
  })
})
