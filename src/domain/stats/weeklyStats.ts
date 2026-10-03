import { WEEKLY_BOARD_TOTAL_POINTS } from '../config/weekly'
import type { WeeklyGoalBoard } from '../weekly/types'
import { finalizedBoardsInWeekOrder } from './history'

export interface WeeklyStats {
  /** Finalized boards: "weeks completed". A week without a board leaves no record and is not counted. */
  readonly finalizedBoards: number
  /** Finalized boards scored exactly 10 / 10. */
  readonly perfectWeeks: number
  /** The highest finalized score, or null before any board was finalized. */
  readonly bestScore: number | null
  /** The mean finalized score (exact, not rounded), or null before any board was finalized. */
  readonly averageScore: number | null
  /** The weekly bonus EXP the finalized boards recorded. */
  readonly totalBonusExp: number
}

/**
 * Derives the Weekly Goal Crusher statistics from the finalized boards' frozen
 * snapshots only. Nothing is recomputed from live completions, templates or the
 * ledger, so a finished week reads the same forever. Active boards are ignored.
 */
export function summarizeWeeklyHistory(boards: readonly WeeklyGoalBoard[]): WeeklyStats {
  const finalized = finalizedBoardsInWeekOrder(boards)
  if (finalized.length === 0) {
    return { finalizedBoards: 0, perfectWeeks: 0, bestScore: null, averageScore: null, totalBonusExp: 0 }
  }
  let perfectWeeks = 0
  let bestScore = 0
  let scoreSum = 0
  let totalBonusExp = 0
  for (const { finalization } of finalized) {
    if (finalization.score === WEEKLY_BOARD_TOTAL_POINTS) perfectWeeks += 1
    bestScore = Math.max(bestScore, finalization.score)
    scoreSum += finalization.score
    totalBonusExp += finalization.bonusExp
  }
  return {
    finalizedBoards: finalized.length,
    perfectWeeks,
    bestScore,
    averageScore: scoreSum / finalized.length,
    totalBonusExp,
  }
}
