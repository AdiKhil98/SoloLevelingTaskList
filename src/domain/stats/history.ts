import type { DailySummary } from '../daily/dailySummary'
import type { XPTransaction } from '../progression/ledger'
import type { WeeklyFinalization, WeeklyGoalBoard } from '../weekly/types'

/**
 * Everything the progression statistics and the achievements are derived from:
 * the immutable record of what happened. Nothing here is a counter; every
 * number the player sees is recomputed from these rows.
 */
export interface ProgressionHistory {
  /** The XP ledger (any order). */
  readonly ledger: readonly XPTransaction[]
  /** The finalized days (any order). */
  readonly dailySummaries: readonly DailySummary[]
  /** Every weekly board (any order); only finalized ones count. */
  readonly weeklyBoards: readonly WeeklyGoalBoard[]
}

/** A board whose finalization snapshot exists: the only kind history is read from. */
export type FinalizedWeeklyBoard = WeeklyGoalBoard & { readonly finalization: WeeklyFinalization }

export function isFinalizedBoard(board: WeeklyGoalBoard): board is FinalizedWeeklyBoard {
  return board.status === 'finalized' && board.finalization !== null
}

/** Ledger order: ascending `seq`, with the id as a tie-break so the order is total. */
function compareLedgerRows(a: XPTransaction, b: XPTransaction): number {
  if (a.seq !== b.seq) return a.seq - b.seq
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** Chronological order of the day chain: ascending `dateKey` (`YYYY-MM-DD` sorts as text). */
function compareSummaries(a: DailySummary, b: DailySummary): number {
  return a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0
}

/** Chronological order of the weeks: ascending `weekKey` (the Monday). */
function compareBoards(a: WeeklyGoalBoard, b: WeeklyGoalBoard): number {
  return a.weekKey < b.weekKey ? -1 : a.weekKey > b.weekKey ? 1 : 0
}

/** A copy of the ledger in ledger order. The input is never reordered. */
export function inLedgerOrder(rows: readonly XPTransaction[]): XPTransaction[] {
  return [...rows].sort(compareLedgerRows)
}

/** A copy of the summaries, oldest day first. The input is never reordered. */
export function inDayOrder(summaries: readonly DailySummary[]): DailySummary[] {
  return [...summaries].sort(compareSummaries)
}

/** The finalized boards, oldest week first. Active boards are not history and are dropped. */
export function finalizedBoardsInWeekOrder(boards: readonly WeeklyGoalBoard[]): FinalizedWeeklyBoard[] {
  return boards.filter(isFinalizedBoard).sort(compareBoards)
}

/**
 * The history in canonical order. Every statistic and every achievement reads
 * this, never the caller's arrays, so the order a caller happened to list rows
 * in can never change a result.
 */
export interface NormalizedHistory {
  readonly ledger: readonly XPTransaction[]
  readonly days: readonly DailySummary[]
  readonly boards: readonly FinalizedWeeklyBoard[]
}

export function normalizeHistory(history: ProgressionHistory): NormalizedHistory {
  return {
    ledger: inLedgerOrder(history.ledger),
    days: inDayOrder(history.dailySummaries),
    boards: finalizedBoardsInWeekOrder(history.weeklyBoards),
  }
}
