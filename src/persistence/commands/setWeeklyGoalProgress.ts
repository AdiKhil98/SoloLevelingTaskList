import {
  compareDateKeys,
  withManualProgress,
  type DateKey,
  type EpochMs,
  type WeekKey,
  type WeeklyGoalBoard,
} from '@/domain'
import { STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { parseWeeklyBoard } from '../records/weeklyBoard'
import { parseForWrite, parseStored } from '../repositories/stored'

export interface SetWeeklyGoalProgressInput {
  readonly weekKey: WeekKey
  readonly goalId: string
  /** The player's new count (an absolute value, not an increment), so repeating it is harmless. */
  readonly progress: number
  readonly today: DateKey
  readonly now: EpochMs
}

export type SetWeeklyGoalProgressRejection =
  | { readonly code: 'board_not_found' }
  | { readonly code: 'board_finalized' }
  | { readonly code: 'week_over'; readonly endDate: DateKey; readonly today: DateKey }
  | { readonly code: 'week_not_started'; readonly startDate: DateKey; readonly today: DateKey }
  | { readonly code: 'goal_not_found'; readonly goalId: string }
  /** Linked goals are derived from completions; they have no number to set. */
  | { readonly code: 'goal_not_manual'; readonly goalId: string }
  | { readonly code: 'progress_invalid' }

export type SetWeeklyGoalProgressResult =
  | { readonly status: 'updated'; readonly board: WeeklyGoalBoard; readonly previous: WeeklyGoalBoard }
  /** The goal already had this value: nothing was written and the revision did not move. */
  | { readonly status: 'unchanged'; readonly board: WeeklyGoalBoard }
  | { readonly status: 'rejected'; readonly reason: SetWeeklyGoalProgressRejection }

/**
 * Sets the player's count on one manually tracked goal of the CURRENT week's
 * active board, atomically. A finalized board is refused here (inside the
 * transaction), independently of any check the caller made.
 */
export async function setWeeklyGoalProgressAtomically(
  database: PersistenceDatabase,
  input: SetWeeklyGoalProgressInput,
): Promise<SetWeeklyGoalProgressResult> {
  return runTransaction(database, [STORE.weeklyBoards], 'readwrite', async (transaction): Promise<SetWeeklyGoalProgressResult> => {
    const boards = transaction.objectStore(STORE.weeklyBoards)
    const raw = await requestToPromise(boards.get(input.weekKey))
    if (raw === undefined) return { status: 'rejected', reason: { code: 'board_not_found' } }
    const board = parseStored(parseWeeklyBoard, raw, `weekly board "${input.weekKey}"`)

    if (board.status !== 'active') return { status: 'rejected', reason: { code: 'board_finalized' } }
    if (compareDateKeys(board.endDate, input.today) < 0) {
      return { status: 'rejected', reason: { code: 'week_over', endDate: board.endDate, today: input.today } }
    }
    if (compareDateKeys(board.startDate, input.today) > 0) {
      return { status: 'rejected', reason: { code: 'week_not_started', startDate: board.startDate, today: input.today } }
    }

    const edited = withManualProgress(board, input.goalId, input.progress, input.now)
    if (!edited.ok) {
      const { error } = edited
      switch (error.code) {
        case 'goal_not_found':
        case 'goal_not_manual':
          return { status: 'rejected', reason: { code: error.code, goalId: error.goalId } }
        case 'progress_invalid':
          return { status: 'rejected', reason: { code: 'progress_invalid' } }
        default:
          return { status: 'rejected', reason: { code: 'board_finalized' } }
      }
    }
    if (!edited.value.changed) return { status: 'unchanged', board }

    const next = parseForWrite(parseWeeklyBoard, edited.value.board, 'weekly board')
    await requestToPromise(boards.put(next))
    return { status: 'updated', board: next, previous: board }
  })
}
