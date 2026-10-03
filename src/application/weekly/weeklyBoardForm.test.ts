import { describe, expect, it } from 'vitest'
import type { WeeklyGoal } from '@/domain'
import { goalRow, REWARD_TEXTS, tenGoals, weeklyForm } from '../test-utils/weekly'
import { parseWeeklyBoardForm } from './weeklyBoardForm'

function parse(values = weeklyForm(), existing: readonly WeeklyGoal[] = []) {
  let counter = 0
  return parseWeeklyBoardForm(values, {
    existingGoals: new Map(existing.map((goal) => [goal.id, goal])),
    newGoalId: () => `wg_new${(counter += 1)}`,
  })
}

describe('parseWeeklyBoardForm — a valid form', () => {
  it('turns the form into a board definition: trimmed text, numbers parsed, fresh ids in order', () => {
    const parsed = parse(
      weeklyForm({
        focus: '  Stay consistent  ',
        goals: [goalRow('g1', { title: '  Backtests ', points: 6, target: ' 20 ', unit: ' reps ', notes: ' x ' }), goalRow('g2', { points: 4 })],
        rewards: { ...REWARD_TEXTS, 7: '  Dessert  ' },
      }),
    )
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.error))
    expect(parsed.value.focus).toBe('Stay consistent')
    expect(parsed.value.goals).toEqual([
      { id: 'wg_new1', title: 'Backtests', maxPoints: 6, target: 20, unit: 'reps', tracking: { mode: 'manual' }, manualProgress: 0, notes: 'x' },
      { id: 'wg_new2', title: 'Goal g2', maxPoints: 4, target: 1, unit: null, tracking: { mode: 'manual' }, manualProgress: 0, notes: null },
    ])
    expect(parsed.value.rewardTiers).toEqual([
      { minScore: 6, text: 'Gaming' },
      { minScore: 7, text: 'Dessert' },
      { minScore: 8, text: 'Movie night' },
      { minScore: 9, text: 'Budgeted purchase' },
      { minScore: 10, text: 'Evening off' },
    ])
  })

  it('turns empty optional fields into null, and an empty reward text into an empty tier', () => {
    const parsed = parse(
      weeklyForm({
        focus: '   ',
        goals: [goalRow('g1', { points: 10 })],
        rewards: { 6: '', 7: '', 8: '', 9: '', 10: '' },
      }),
    )
    if (!parsed.ok) throw new Error('expected a valid form')
    expect(parsed.value.focus).toBeNull()
    expect(parsed.value.goals.every((goal) => goal.unit === null && goal.notes === null)).toBe(true)
    expect(parsed.value.rewardTiers.map((tier) => tier.text)).toEqual(['', '', '', '', ''])
  })

  it('builds a linked goal from the chosen quest', () => {
    const parsed = parse(
      weeklyForm({
        goals: [goalRow('g1', { points: 10, target: '3', trackingMode: 'linked_quest', templateId: ' tpl_gym ' })],
      }),
    )
    if (!parsed.ok) throw new Error('expected a valid form')
    expect(parsed.value.goals[0]?.tracking).toEqual({ mode: 'linked_quest', templateId: 'tpl_gym' })
  })

  it('keeps an existing goal’s id and its manual progress, and gives a new row a fresh id', () => {
    const existing: WeeklyGoal = { id: 'wg_keep', title: 'Old', maxPoints: 6, target: 20, unit: null, tracking: { mode: 'manual' }, manualProgress: 14, notes: null }
    const parsed = parse(
      weeklyForm({
        goals: [goalRow('wg_keep', { goalId: 'wg_keep', title: 'Renamed', points: 6, target: '20' }), goalRow('added', { points: 4 })],
      }),
      [existing],
    )
    if (!parsed.ok) throw new Error('expected a valid form')
    expect(parsed.value.goals.map((goal) => [goal.id, goal.title, goal.manualProgress])).toEqual([
      ['wg_keep', 'Renamed', 14],
      ['wg_new1', 'Goal added', 0],
    ])
  })

  it('keeps the manual progress when a goal is switched to linked and back (it is only ignored while linked)', () => {
    const existing: WeeklyGoal = { id: 'wg_k', title: 'K', maxPoints: 10, target: 5, unit: null, tracking: { mode: 'manual' }, manualProgress: 3, notes: null }
    const linked = parse(weeklyForm({ goals: [goalRow('wg_k', { goalId: 'wg_k', points: 10, target: '5', trackingMode: 'linked_quest', templateId: 'tpl_gym' })] }), [existing])
    if (!linked.ok) throw new Error('expected a valid form')
    expect(linked.value.goals[0]).toMatchObject({ tracking: { mode: 'linked_quest', templateId: 'tpl_gym' }, manualProgress: 3 })
  })

  it.each([[[3, 3, 2, 1, 1]], [[4, 3, 2, 1]], [[5, 3, 2]], [[10]]])('accepts the weighting %j', (points) => {
    const goals = points.map((value, index) => goalRow(`w${index}`, { points: value }))
    expect(parse(weeklyForm({ goals })).ok).toBe(true)
  })
})

describe('parseWeeklyBoardForm — validation', () => {
  it.each([
    ['below ten', [3, 3, 2, 1], 9],
    ['above ten', [3, 3, 2, 1, 2], 11],
  ])('rejects points that add up to %s, saying what they add up to', (_name, points, total) => {
    const result = parse(weeklyForm({ goals: points.map((value, index) => goalRow(`w${index}`, { points: value })) }))
    expect(result).toMatchObject({ ok: false, error: { board: ['points_total_invalid'], total } })
  })

  it('rejects an empty board', () => {
    expect(parse(weeklyForm({ goals: [] }))).toMatchObject({ ok: false, error: { board: ['no_goals'] } })
  })

  it.each([[''], ['abc'], ['2.5'], ['-1'], ['0'], ['1e3'], ['10000'], ['  ']])('rejects the target %j', (target) => {
    const result = parse(weeklyForm({ goals: [goalRow('g1', { points: 10, target })] }))
    expect(result).toMatchObject({ ok: false, error: { goals: { g1: { target: 'target_invalid' } } } })
  })

  it('reports field errors per row, all together', () => {
    const result = parse(
      weeklyForm({
        goals: [
          goalRow('a', { title: '  ', points: 5, target: 'x' }),
          goalRow('b', { points: 5, trackingMode: 'linked_quest', templateId: '' }),
          goalRow('c', { points: 0 }),
        ],
        focus: 'f'.repeat(201),
        rewards: { ...REWARD_TEXTS, 8: 'r'.repeat(121) },
      }),
    )
    if (result.ok) throw new Error('expected errors')
    expect(result.error.goals).toEqual({
      a: { title: 'title_required', target: 'target_invalid' },
      b: { link: 'link_required' },
      c: { points: 'points_invalid' },
    })
    expect(result.error.board).toContain('focus_too_long')
    expect(result.error.rewards).toEqual({ 8: 'reward_text_too_long' })
  })

  it('can express ten one-point goals', () => {
    expect(parse(weeklyForm({ goals: tenGoals() })).ok).toBe(true)
  })

  it('does not call the id generator for rows it is not given a new id for', () => {
    let calls = 0
    parseWeeklyBoardForm(weeklyForm({ goals: [goalRow('a', { goalId: 'wg_a', points: 10 })] }), {
      existingGoals: new Map(),
      newGoalId: () => `wg_${(calls += 1)}`,
    })
    expect(calls).toBe(0)
  })
})
