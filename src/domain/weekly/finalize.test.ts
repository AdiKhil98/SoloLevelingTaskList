import { describe, expect, it } from 'vitest'
import { WEEKLY_LIMITS, weeklyBonusExpForScore } from '../config/weekly'
import { asDateKey } from '../time/dateKey'
import { buildNewWeeklyBoard, editWeeklyBoard, withManualProgress } from './board'
import { buildWeeklyGoalCompletedEvents } from './events'
import { finalizeWeeklyBoard, type FinalizeWeeklyBoardInput } from './finalize'
import { weeklyBonusIdempotencyKey, weeklyBonusTransactionId } from './keys'
import { evaluateWeeklyGoals } from './scoring'
import { activeBoard, definition, goal, NEXT_MONDAY, SUNDAY, TIERS, WEEK } from './testFixtures'
import type { WeeklyGoal } from './types'

const FINALIZED_AT = Date.UTC(2026, 9, 14, 8, 0, 0) // Wednesday, three days after the week ended

/** A board whose goals add up to ten points, with the first `done` goals' worth completed. */
function boardScoring(score: number) {
  const goals: WeeklyGoal[] = Array.from({ length: 10 }, (_, index) =>
    goal({ id: `wg_${index}`, maxPoints: 1, manualProgress: index < score ? 1 : 0 }),
  )
  return activeBoard({ goals })
}

function finalizeInput(overrides: Partial<FinalizeWeeklyBoardInput> = {}): FinalizeWeeklyBoardInput {
  return {
    board: activeBoard(),
    linkedCounts: new Map(),
    ledger: { totalExp: 100, lastSeq: 4 },
    today: NEXT_MONDAY,
    finalizedAt: FINALIZED_AT,
    ...overrides,
  }
}

describe('finalizeWeeklyBoard', () => {
  it.each([
    [0, 0],
    [3, 0],
    [5, 0],
    [6, 100],
    [7, 150],
    [8, 225],
    [9, 325],
    [10, 500],
  ])('a score of %i pays %i EXP through one ledger row (or none)', (score, bonus) => {
    const result = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(score) }))
    if (result.status !== 'finalized') throw new Error('expected finalization')
    expect(result.board.finalization).toMatchObject({ score, bonusExp: bonus })
    if (bonus === 0) {
      expect(result.xpTransaction).toBeNull()
      expect(result.progression).toBeNull()
      expect(result.board.finalization?.xpTransactionId).toBeNull()
    } else {
      expect(result.xpTransaction).toMatchObject({ amount: bonus, seq: 5, totalExpAfter: 100 + bonus })
      expect(result.board.finalization?.xpTransactionId).toBe(result.xpTransaction?.id)
    }
  })

  it('writes the bonus row with the real instant, the Sunday as its effective date and the Monday as its source week', () => {
    const result = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(9) }))
    if (result.status !== 'finalized' || result.xpTransaction === null) throw new Error('expected a bonus')
    expect(result.xpTransaction).toEqual({
      id: 'xp:weekly_goal_crusher:2026-10-05',
      seq: 5,
      idempotencyKey: 'weekly_goal_crusher:2026-10-05',
      source: { type: 'weekly_goal_crusher', weekKey: WEEK, score: 9 },
      amount: 325,
      category: null, // no category attribution
      createdAt: FINALIZED_AT, // the real Wednesday instant, never back-dated
      effectiveDate: SUNDAY,
      sourceWeekKey: WEEK,
      totalExpAfter: 425,
    })
    expect(result.xpTransaction.id).toBe(weeklyBonusTransactionId(WEEK))
    expect(result.xpTransaction.idempotencyKey).toBe(weeklyBonusIdempotencyKey(WEEK))
  })

  it('freezes the exact progress it scored: manual values and the linked count passed in', () => {
    const board = activeBoard({
      goals: [
        goal({ id: 'wg_gym', maxPoints: 6, target: 3, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }),
        goal({ id: 'wg_bt', maxPoints: 4, target: 20, unit: 'backtests', manualProgress: 25 }),
      ],
    })
    const result = finalizeWeeklyBoard(finalizeInput({ board, linkedCounts: new Map([['tpl_gym', 3]]) }))
    if (result.status !== 'finalized') throw new Error('expected finalization')
    expect(result.board.finalization?.goalResults).toEqual([
      { goalId: 'wg_gym', title: 'Goal wg_gym', unit: null, maxPoints: 6, target: 3, trackingMode: 'linked_quest', templateId: 'tpl_gym', finalProgress: 3, completed: true, earnedPoints: 6 },
      { goalId: 'wg_bt', title: 'Goal wg_bt', unit: 'backtests', maxPoints: 4, target: 20, trackingMode: 'manual', templateId: null, finalProgress: 25, completed: true, earnedPoints: 4 },
    ])
    expect(result.board.finalization?.score).toBe(10)
  })

  it('snapshots the highest reward tier with its text, and none below 6', () => {
    const high = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(8) }))
    const low = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(5) }))
    if (high.status !== 'finalized' || low.status !== 'finalized') throw new Error('expected finalization')
    expect(high.board.finalization?.rewardTier).toEqual({ minScore: 8, text: 'Movie night' })
    expect(low.board.finalization?.rewardTier).toBeNull()
  })

  it('leaves the goals and the reward text on the board as they were and freezes it', () => {
    const board = boardScoring(7)
    const result = finalizeWeeklyBoard(finalizeInput({ board }))
    if (result.status !== 'finalized') throw new Error('expected finalization')
    expect(result.board).toMatchObject({
      status: 'finalized',
      goals: board.goals,
      rewardTiers: TIERS,
      focus: board.focus,
      revision: board.revision + 1,
      updatedAt: FINALIZED_AT,
      createdAt: board.createdAt,
    })
  })

  it('reports the bonus as events in presentation order: board finalized, then XP, level and rank', () => {
    // 4,000,000 EXP is level 100+; a 500 bonus still emits one XPAwarded; a big jump from 0 crosses levels.
    const result = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(10), ledger: { totalExp: 0, lastSeq: 0 } }))
    if (result.status !== 'finalized') throw new Error('expected finalization')
    expect(result.events.map((event) => event.type).slice(0, 2)).toEqual(['WeeklyBoardFinalized', 'XPAwarded'])
    expect(result.events[0]).toEqual({ type: 'WeeklyBoardFinalized', weekKey: WEEK, score: 10, bonusExp: 500, rewardTierMinScore: 10 })
    expect(result.events[1]).toMatchObject({ type: 'XPAwarded', amount: 500, sourceType: 'weekly_goal_crusher', category: null, totalExpBefore: 0, totalExpAfter: 500 })
    expect(result.events.some((event) => event.type === 'LevelUp')).toBe(true) // 500 EXP from zero crosses several levels
    expect(result.progression?.levelsCrossed.length).toBeGreaterThan(1)
  })

  it('a week without a bonus emits only the finalized event and writes no row', () => {
    const result = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(2) }))
    if (result.status !== 'finalized') throw new Error('expected finalization')
    expect(result.events).toEqual([{ type: 'WeeklyBoardFinalized', weekKey: WEEK, score: 2, bonusExp: 0, rewardTierMinScore: null }])
  })

  it('refuses a week that is not over (today is its Sunday or earlier)', () => {
    for (const today of ['2026-10-05', '2026-10-08', '2026-10-11']) {
      const result = finalizeWeeklyBoard(finalizeInput({ today: asDateKey(today) }))
      expect(result).toEqual({ status: 'rejected', reason: { code: 'week_not_over', endDate: SUNDAY, today } })
    }
  })

  it('finalizes from Monday 00:00 onwards, however late', () => {
    for (const today of ['2026-10-12', '2026-10-13', '2027-03-01']) {
      expect(finalizeWeeklyBoard(finalizeInput({ today: asDateKey(today) })).status).toBe('finalized')
    }
  })

  it('treats an already finalized board as a no-op: no row, no events, the same board back', () => {
    const first = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(9) }))
    if (first.status !== 'finalized') throw new Error('expected finalization')
    const again = finalizeWeeklyBoard(finalizeInput({ board: first.board, ledger: { totalExp: 425, lastSeq: 5 } }))
    expect(again).toEqual({ status: 'already_finalized', board: first.board })
  })

  it('rejects a corrupt ledger state or an overflow instead of guessing', () => {
    const board = boardScoring(9)
    for (const ledger of [{ totalExp: -1, lastSeq: 0 }, { totalExp: 0, lastSeq: -1 }, { totalExp: 1.5, lastSeq: 0 }]) {
      expect(finalizeWeeklyBoard(finalizeInput({ board, ledger }))).toEqual({ status: 'rejected', reason: { code: 'invalid_ledger_state' } })
    }
    expect(finalizeWeeklyBoard(finalizeInput({ board, ledger: { totalExp: Number.MAX_SAFE_INTEGER, lastSeq: 1 } }))).toEqual({
      status: 'rejected',
      reason: { code: 'exp_overflow' },
    })
    // A week that pays nothing never touches the ledger, so a corrupt tip does not matter to it.
    expect(finalizeWeeklyBoard(finalizeInput({ board: boardScoring(1), ledger: { totalExp: -1, lastSeq: 0 } })).status).toBe('finalized')
  })

  it('is deterministic: the same inputs give identical results', () => {
    const input = finalizeInput({ board: boardScoring(8) })
    expect(finalizeWeeklyBoard(input)).toEqual(finalizeWeeklyBoard(input))
  })
})

describe('board transitions', () => {
  it('buildNewWeeklyBoard makes revision 1, active, with the week’s dates', () => {
    const built = buildNewWeeklyBoard(WEEK, definition(), 5_000)
    if (!built.ok) throw new Error('expected a board')
    expect(built.value).toMatchObject({
      weekKey: WEEK,
      startDate: WEEK,
      endDate: SUNDAY,
      status: 'active',
      revision: 1,
      createdAt: 5_000,
      updatedAt: 5_000,
      finalization: null,
    })
  })

  it('refuses to build or edit a board whose weights do not total 10', () => {
    const bad = definition({ goals: [goal({ id: 'wg_a', maxPoints: 9 })] })
    expect(buildNewWeeklyBoard(WEEK, bad, 1)).toMatchObject({ ok: false, error: { code: 'invalid' } })
    expect(editWeeklyBoard(activeBoard(), bad, 2)).toMatchObject({ ok: false, error: { code: 'invalid' } })
  })

  it('editWeeklyBoard keeps identity and creation time and bumps the revision', () => {
    const board = activeBoard({ revision: 3, createdAt: 10, updatedAt: 20 })
    const edited = editWeeklyBoard(board, definition({ focus: 'New focus' }), 99)
    if (!edited.ok) throw new Error('expected an edit')
    expect(edited.value).toMatchObject({ weekKey: WEEK, createdAt: 10, updatedAt: 99, revision: 4, focus: 'New focus', status: 'active', finalization: null })
  })

  it('a finalized board refuses every edit (the domain’s own guard)', () => {
    const finalized = finalizeWeeklyBoard(finalizeInput({ board: boardScoring(7) }))
    if (finalized.status !== 'finalized') throw new Error('expected finalization')
    expect(editWeeklyBoard(finalized.board, definition(), 1)).toEqual({ ok: false, error: { code: 'board_finalized' } })
    expect(withManualProgress(finalized.board, 'wg_0', 5, 1)).toEqual({ ok: false, error: { code: 'board_finalized' } })
  })

  describe('withManualProgress', () => {
    const board = activeBoard({
      goals: [
        goal({ id: 'wg_m', maxPoints: 5, target: 20 }),
        goal({ id: 'wg_l', maxPoints: 5, target: 3, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } }),
      ],
    })

    it('sets an absolute count and bumps the revision', () => {
      const result = withManualProgress(board, 'wg_m', 14, 77)
      if (!result.ok) throw new Error('expected an update')
      expect(result.value.changed).toBe(true)
      expect(result.value.board.goals[0]?.manualProgress).toBe(14)
      expect(result.value.board).toMatchObject({ revision: board.revision + 1, updatedAt: 77 })
    })

    it('setting the value a goal already has changes nothing (no revision bump)', () => {
      const once = withManualProgress(board, 'wg_m', 14, 77)
      if (!once.ok) throw new Error('expected an update')
      const twice = withManualProgress(once.value.board, 'wg_m', 14, 99)
      expect(twice).toMatchObject({ ok: true, value: { changed: false } })
      if (twice.ok) expect(twice.value.board).toBe(once.value.board)
    })

    it('allows going down (a correction) and above the target', () => {
      const up = withManualProgress(board, 'wg_m', 25, 1)
      expect(up.ok && up.value.board.goals[0]?.manualProgress).toBe(25)
      const down = withManualProgress(board, 'wg_m', 0, 1)
      expect(down.ok).toBe(true)
    })

    it('rejects a linked goal, an unknown goal and an invalid number', () => {
      expect(withManualProgress(board, 'wg_l', 2, 1)).toEqual({ ok: false, error: { code: 'goal_not_manual', goalId: 'wg_l' } })
      expect(withManualProgress(board, 'wg_x', 2, 1)).toEqual({ ok: false, error: { code: 'goal_not_found', goalId: 'wg_x' } })
      for (const progress of [-1, 1.5, Number.NaN, WEEKLY_LIMITS.progressMax + 1]) {
        expect(withManualProgress(board, 'wg_m', progress, 1)).toEqual({ ok: false, error: { code: 'progress_invalid' } })
      }
    })
  })
})

describe('WeeklyGoalCompleted events', () => {
  const goals = [
    goal({ id: 'wg_a', maxPoints: 6, target: 2 }),
    goal({ id: 'wg_b', maxPoints: 4, target: 1, manualProgress: 1 }),
  ]

  it('fires once for the goal that just reached its target, with the score now', () => {
    const before = evaluateWeeklyGoals(goals, new Map())
    const after = evaluateWeeklyGoals([{ ...goals[0]!, manualProgress: 2 }, goals[1]!], new Map())
    expect(buildWeeklyGoalCompletedEvents(WEEK, before, after)).toEqual([
      { type: 'WeeklyGoalCompleted', weekKey: WEEK, goalId: 'wg_a', earnedPoints: 6, scoreNow: 10 },
    ])
  })

  it('does not fire for a goal that was already complete, or that is still short', () => {
    const before = evaluateWeeklyGoals(goals, new Map())
    expect(buildWeeklyGoalCompletedEvents(WEEK, before, before)).toEqual([])
    const stillShort = evaluateWeeklyGoals([{ ...goals[0]!, manualProgress: 1 }, goals[1]!], new Map())
    expect(buildWeeklyGoalCompletedEvents(WEEK, before, stillShort)).toEqual([])
  })

  it('has a bonus table matching the approved values', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(weeklyBonusExpForScore)).toEqual([0, 0, 0, 0, 0, 0, 100, 150, 225, 325, 500])
  })
})
