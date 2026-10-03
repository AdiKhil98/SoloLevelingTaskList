import { describe, expect, it } from 'vitest'
import { finalizeWeeklyBoard, type WeeklyGoalBoard } from '@/domain'
import { activeBoard, goal, NEXT_MONDAY, TIERS } from '../../domain/weekly/testFixtures'
import { parseWeeklyBoard, parseWeeklyRewardClaim } from './weeklyBoard'

const issueCodes = (result: ReturnType<typeof parseWeeklyBoard>) => (result.ok ? [] : result.error.map((issue) => issue.code))

/** The parts of a stored board a test corrupts, all writable (a plain JSON copy of the real record). */
interface DraftResult {
  goalId: string
  title: string
  finalProgress: number
  completed: boolean
  earnedPoints: number
}
interface DraftFinalization {
  finalizedAt: number
  score: number
  bonusExp: number
  xpTransactionId: string | null
  rewardTier: { minScore: number; text: string } | null
  goalResults: DraftResult[]
}
interface Draft {
  weekKey: string
  startDate: string
  endDate: string
  status: string
  revision: number
  updatedAt: number
  goals: { maxPoints: number; tracking?: unknown }[]
  rewardTiers: unknown[]
  finalization: DraftFinalization | null
}

/** A finalized board built by the domain. */
function finalized(score: number): WeeklyGoalBoard {
  const goals = Array.from({ length: 10 }, (_, index) => goal({ id: `wg_${index}`, maxPoints: 1, manualProgress: index < score ? 1 : 0 }))
  const result = finalizeWeeklyBoard({
    board: activeBoard({ goals }),
    linkedCounts: new Map(),
    ledger: { totalExp: 0, lastSeq: 0 },
    today: NEXT_MONDAY,
    finalizedAt: 5_000,
  })
  if (result.status !== 'finalized') throw new Error('fixture')
  return result.board
}

/** A deep, writable copy of `board` after `change` has corrupted it. */
function tamper(board: WeeklyGoalBoard, change: (draft: Draft) => void): unknown {
  const draft: Draft = JSON.parse(JSON.stringify(board))
  change(draft)
  return draft
}

/** The finalization of a tampered draft (a finalized board always has one). */
function final(draft: Draft): DraftFinalization {
  if (draft.finalization === null) throw new Error('fixture: the board is not finalized')
  return draft.finalization
}

const firstGoal = (draft: Draft) => {
  const first = draft.goals[0]
  if (first === undefined) throw new Error('fixture: no goal')
  return first
}

describe('weekly board records', () => {
  it('accepts an active board and a finalized one and returns them unchanged', () => {
    const active = activeBoard()
    expect(parseWeeklyBoard(active)).toEqual({ ok: true, value: active })
    const done = finalized(8)
    expect(parseWeeklyBoard(done)).toEqual({ ok: true, value: done })
  })

  it('rejects unexpected fields, a missing field and a wrong shape', () => {
    expect(issueCodes(parseWeeklyBoard({ ...activeBoard(), extra: 1 }))).toContain('unexpected_field')
    const { goals, ...withoutGoals } = activeBoard()
    expect(goals).toBeDefined()
    expect(parseWeeklyBoard(withoutGoals).ok).toBe(false)
    expect(parseWeeklyBoard('board').ok).toBe(false)
    expect(parseWeeklyBoard(null).ok).toBe(false)
  })

  it('applies the exactly-10 rule when reading (a hand-edited board cannot slip in)', () => {
    const bad = tamper(activeBoard(), (draft) => {
      firstGoal(draft).maxPoints = 4
    })
    expect(issueCodes(parseWeeklyBoard(bad))).toContain('board_points_total_invalid')
  })

  it('checks the week’s dates', () => {
    expect(
      issueCodes(
        parseWeeklyBoard(
          tamper(activeBoard(), (draft) => {
            draft.weekKey = '2026-10-06'
            draft.startDate = '2026-10-06'
          }),
        ),
      ),
    ).toContain('week_key_not_monday')
    expect(issueCodes(parseWeeklyBoard(tamper(activeBoard(), (draft) => { draft.startDate = '2026-10-06' })))).toContain('week_dates_mismatch')
    expect(issueCodes(parseWeeklyBoard(tamper(activeBoard(), (draft) => { draft.endDate = '2026-10-12' })))).toContain('week_dates_mismatch')
  })

  it('checks tracking, tiers, revision and timestamps', () => {
    expect(parseWeeklyBoard(tamper(activeBoard(), (draft) => { Object.assign(firstGoal(draft), { tracking: { mode: 'magic' } }) })).ok).toBe(false)
    expect(parseWeeklyBoard(tamper(activeBoard(), (draft) => { Object.assign(firstGoal(draft), { tracking: { mode: 'linked_quest' } }) })).ok).toBe(false)
    expect(issueCodes(parseWeeklyBoard(tamper(activeBoard(), (draft) => { draft.rewardTiers.pop() })))).toContain('board_reward_tiers_invalid')
    expect(parseWeeklyBoard(tamper(activeBoard(), (draft) => { draft.revision = 0 })).ok).toBe(false)
    expect(issueCodes(parseWeeklyBoard(tamper(activeBoard(), (draft) => { draft.updatedAt = 1 })))).toContain('out_of_range')
  })

  it('keeps status and finalization paired', () => {
    const done = finalized(8)
    expect(issueCodes(parseWeeklyBoard(tamper(done, (draft) => { draft.status = 'active' })))).toContain('status_finalization_mismatch')
    expect(issueCodes(parseWeeklyBoard(tamper(done, (draft) => { draft.finalization = null })))).toContain('status_finalization_mismatch')
    expect(issueCodes(parseWeeklyBoard(tamper(activeBoard(), (draft) => { draft.status = 'finalized' })))).toContain('status_finalization_mismatch')
  })
})

describe('a finalized board’s frozen snapshot must agree with itself', () => {
  const result = (draft: Draft, index: number) => {
    const entry = final(draft).goalResults[index]
    if (entry === undefined) throw new Error('fixture: no goal result')
    return entry
  }

  it.each<[string, (draft: Draft) => void, string]>([
    ['a wrong score', (draft) => { final(draft).score = 9 }, 'final_score_mismatch'],
    ['a wrong bonus', (draft) => { final(draft).bonusExp = 100 }, 'final_bonus_mismatch'],
    ['a transaction id on a week that paid nothing', (draft) => { final(draft).bonusExp = 0; final(draft).xpTransactionId = 'xp:x' }, 'final_transaction_mismatch'],
    ['a wrong transaction id', (draft) => { final(draft).xpTransactionId = 'xp:other' }, 'final_transaction_mismatch'],
    ['a reward tier that is not the highest reached', (draft) => { final(draft).rewardTier = { minScore: 7, text: TIERS[1]!.text } }, 'final_tier_mismatch'],
    ['a changed reward text', (draft) => { final(draft).rewardTier = { minScore: 8, text: 'Something else' } }, 'final_tier_mismatch'],
    ['a missing reward tier', (draft) => { final(draft).rewardTier = null }, 'final_tier_mismatch'],
    ['a result list of the wrong length', (draft) => { final(draft).goalResults.pop() }, 'final_results_mismatch'],
    ['a result that names another goal', (draft) => { result(draft, 0).goalId = 'wg_other' }, 'final_result_goal_mismatch'],
    ['a result with a changed title', (draft) => { result(draft, 0).title = 'Renamed' }, 'final_result_goal_mismatch'],
    ['a completion flag that disagrees with the progress', (draft) => { result(draft, 9).completed = true }, 'final_result_completion_mismatch'],
    ['earned points that disagree with the flag', (draft) => { result(draft, 0).earnedPoints = 0 }, 'final_result_points_mismatch'],
    ['a manual progress that is not the frozen value', (draft) => { result(draft, 0).finalProgress = 5 }, 'final_progress_mismatch'],
  ])('rejects %s', (_name, change, code) => {
    expect(issueCodes(parseWeeklyBoard(tamper(finalized(8), change)))).toContain(code)
  })

  it('rejects a finalization that precedes the board’s creation', () => {
    expect(issueCodes(parseWeeklyBoard(tamper(finalized(8), (draft) => { final(draft).finalizedAt = 1 })))).toContain('out_of_range')
  })

  it('limits a linked goal’s frozen progress to what one week can hold', () => {
    const linked = activeBoard({
      goals: [goal({ id: 'wg_l', maxPoints: 10, target: 1, tracking: { mode: 'linked_quest', templateId: 'tpl_gym' } })],
    })
    const done = finalizeWeeklyBoard({ board: linked, linkedCounts: new Map([['tpl_gym', 3]]), ledger: { totalExp: 0, lastSeq: 0 }, today: NEXT_MONDAY, finalizedAt: 5_000 })
    if (done.status !== 'finalized') throw new Error('fixture')
    expect(parseWeeklyBoard(done.board).ok).toBe(true)
    expect(issueCodes(parseWeeklyBoard(tamper(done.board, (draft) => { result(draft, 0).finalProgress = 8 })))).toContain('out_of_range')
  })
})

describe('weekly reward claims', () => {
  const claim = { weekKey: '2026-10-05', tierMinScore: 8, rewardTextSnapshot: 'Movie night', claimedAt: 9_000 }

  it('accepts a valid claim', () => {
    expect(parseWeeklyRewardClaim(claim).ok).toBe(true)
  })

  it.each([
    ['a tier that does not exist', { ...claim, tierMinScore: 5 }],
    ['a week key that is not a Monday', { ...claim, weekKey: '2026-10-06' }],
    ['empty reward text', { ...claim, rewardTextSnapshot: '' }],
    ['a missing timestamp', { weekKey: claim.weekKey, tierMinScore: 8, rewardTextSnapshot: 'x' }],
    ['an unexpected field', { ...claim, exp: 100 }],
  ])('rejects %s', (_name, value) => {
    expect(parseWeeklyRewardClaim(value).ok).toBe(false)
  })
})
