import type { DomainEvent } from '../events/types'
import { applyExpAward, type ProgressionChange } from '../progression/award'
import type { LedgerState, XPTransaction } from '../progression/ledger'
import { compareDateKeys } from '../time/dateKey'
import type { DateKey, EpochMs } from '../types/scalars'
import { weeklyBonusExpForScore } from '../config/weekly'
import { weeklyBonusIdempotencyKey, weeklyBonusTransactionId } from './keys'
import { evaluateWeeklyGoals, rewardTierForScore, type LinkedCompletionCounts } from './scoring'
import type { WeeklyGoalBoard } from './types'

export interface FinalizeWeeklyBoardInput {
  readonly board: WeeklyGoalBoard
  /** Completions of each template inside the board's week, read in the same transaction. */
  readonly linkedCounts: LinkedCompletionCounts
  /** The ledger tip, read in the same transaction (`seq` and the running total are allocated from it). */
  readonly ledger: LedgerState
  /** The caller's local date; a week that is not over is never finalized. */
  readonly today: DateKey
  /** The real instant of finalization; the bonus row's `createdAt`. Never read from a clock here. */
  readonly finalizedAt: EpochMs
}

export type FinalizeWeeklyBoardRejection =
  /** The board's Sunday is today or later: the week is not over. */
  | { readonly code: 'week_not_over'; readonly endDate: DateKey; readonly today: DateKey }
  | { readonly code: 'invalid_ledger_state' }
  /** Total EXP would leave the safe integer range (technical limit only). */
  | { readonly code: 'exp_overflow' }

export interface WeeklyFinalizationOutcome {
  /** The frozen board. */
  readonly board: WeeklyGoalBoard
  /** The single ledger row, or null when the bonus is 0. */
  readonly xpTransaction: XPTransaction | null
  readonly progression: ProgressionChange | null
  /** `WeeklyBoardFinalized`, then (if a bonus was paid) `XPAwarded`, `LevelUp`, `RankUp`. */
  readonly events: readonly DomainEvent[]
}

export type FinalizeWeeklyBoardResult =
  | ({ readonly status: 'finalized' } & WeeklyFinalizationOutcome)
  /** A repeat: the stored board, nothing to write, no EXP, no events. */
  | { readonly status: 'already_finalized'; readonly board: WeeklyGoalBoard }
  | { readonly status: 'rejected'; readonly reason: FinalizeWeeklyBoardRejection }

/**
 * Finalizes a week's board (MASTER_SPEC §12.7). Pure: it returns the frozen
 * board and the single bonus row a caller must commit atomically.
 *
 *  - the goals are scored once, on the exact progress passed in (the manual
 *    value, or the linked completion count), and that progress is stored in the
 *    board's `goalResults`, so history never recomputes from later data;
 *  - the bonus is a lookup of the score (never cumulative); a score below 6
 *    earns none and writes no ledger row;
 *  - the row's `createdAt` is the real instant, its `effectiveDate` the week's
 *    Sunday and its `sourceWeekKey` the Monday, so it is never back-dated.
 */
export function finalizeWeeklyBoard(input: FinalizeWeeklyBoardInput): FinalizeWeeklyBoardResult {
  const { board, linkedCounts, ledger, today, finalizedAt } = input
  if (board.status === 'finalized') return { status: 'already_finalized', board }

  if (compareDateKeys(board.endDate, today) >= 0) {
    return { status: 'rejected', reason: { code: 'week_not_over', endDate: board.endDate, today } }
  }

  const evaluation = evaluateWeeklyGoals(board.goals, linkedCounts)
  const bonusExp = weeklyBonusExpForScore(evaluation.score)
  const rewardTier = rewardTierForScore(evaluation.score, board.rewardTiers)

  let xpTransaction: XPTransaction | null = null
  let progression: ProgressionChange | null = null
  if (bonusExp > 0) {
    if (
      !Number.isSafeInteger(ledger.totalExp) ||
      ledger.totalExp < 0 ||
      !Number.isSafeInteger(ledger.lastSeq) ||
      ledger.lastSeq < 0
    ) {
      return { status: 'rejected', reason: { code: 'invalid_ledger_state' } }
    }
    if (!Number.isSafeInteger(ledger.totalExp + bonusExp) || !Number.isSafeInteger(ledger.lastSeq + 1)) {
      return { status: 'rejected', reason: { code: 'exp_overflow' } }
    }
    progression = applyExpAward(ledger.totalExp, bonusExp)
    xpTransaction = {
      id: weeklyBonusTransactionId(board.weekKey),
      seq: ledger.lastSeq + 1,
      idempotencyKey: weeklyBonusIdempotencyKey(board.weekKey),
      source: { type: 'weekly_goal_crusher', weekKey: board.weekKey, score: evaluation.score },
      amount: bonusExp,
      category: null,
      createdAt: finalizedAt,
      effectiveDate: board.endDate,
      sourceWeekKey: board.weekKey,
      totalExpAfter: progression.totalExpAfter,
    }
  }

  const finalized: WeeklyGoalBoard = {
    ...board,
    status: 'finalized',
    updatedAt: finalizedAt,
    revision: board.revision + 1,
    finalization: {
      finalizedAt,
      score: evaluation.score,
      bonusExp,
      xpTransactionId: xpTransaction === null ? null : xpTransaction.id,
      goalResults: evaluation.goalResults,
      rewardTier,
    },
  }

  const events: DomainEvent[] = [
    {
      type: 'WeeklyBoardFinalized',
      weekKey: board.weekKey,
      score: evaluation.score,
      bonusExp,
      rewardTierMinScore: rewardTier === null ? null : rewardTier.minScore,
    },
  ]
  if (xpTransaction !== null && progression !== null) {
    events.push({
      type: 'XPAwarded',
      transactionId: xpTransaction.id,
      amount: xpTransaction.amount,
      sourceType: xpTransaction.source.type,
      category: null,
      totalExpBefore: progression.totalExpBefore,
      totalExpAfter: progression.totalExpAfter,
    })
    if (progression.levelsCrossed.length > 0) {
      events.push({
        type: 'LevelUp',
        previousLevel: progression.before.level,
        newLevel: progression.after.level,
        levelsCrossed: progression.levelsCrossed,
        expIntoLevel: progression.after.expIntoLevel,
        expToNext: progression.after.expToNext,
      })
    }
    for (const transition of progression.rankTransitions) events.push({ type: 'RankUp', ...transition })
  }

  return { status: 'finalized', board: finalized, xpTransaction, progression, events }
}
