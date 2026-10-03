import {
  buildNewWeeklyBoard,
  compareDateKeys,
  editWeeklyBoard,
  weekEndOf,
  type DateKey,
  type EpochMs,
  type WeekKey,
  type WeeklyBoardDefinition,
  type WeeklyBoardProblem,
  type WeeklyGoalBoard,
} from '@/domain'
import { STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { parseWeeklyBoard } from '../records/weeklyBoard'
import { parseForWrite, parseStored } from '../repositories/stored'

export interface SaveWeeklyBoardInput {
  readonly weekKey: WeekKey
  /** What the player authored. Identity, status, revision and audit fields are never taken from the caller. */
  readonly definition: WeeklyBoardDefinition
  /** `null` creates the week's board; a number edits it and must equal the stored revision. */
  readonly expectedRevision: number | null
  /** The caller's local date; only the CURRENT week's board may be created or edited. */
  readonly today: DateKey
  /** The real instant of the write. Supplied by the caller; never read here. */
  readonly now: EpochMs
}

export type SaveWeeklyBoardRejection =
  /** Creating, but the week already has a board. */
  | { readonly code: 'board_exists' }
  /** Editing, but the week has no board. */
  | { readonly code: 'board_not_found' }
  /** The board is final: finalized boards are never changed. */
  | { readonly code: 'board_finalized' }
  /** The stored board moved on since the caller read it. */
  | { readonly code: 'stale_revision'; readonly expected: number; readonly actual: number }
  /** The week's Sunday is before `today`. */
  | { readonly code: 'week_over'; readonly endDate: DateKey; readonly today: DateKey }
  /** The week's Monday is after `today`: boards for future weeks do not exist. */
  | { readonly code: 'week_not_started'; readonly startDate: DateKey; readonly today: DateKey }
  /** A linked goal names a quest template that is not stored. */
  | { readonly code: 'unknown_template'; readonly templateId: string }
  | { readonly code: 'invalid'; readonly problems: readonly WeeklyBoardProblem[] }

export type SaveWeeklyBoardResult =
  | { readonly status: 'created' | 'updated'; readonly board: WeeklyGoalBoard }
  | { readonly status: 'rejected'; readonly reason: SaveWeeklyBoardRejection }

const SAVE_STORES = [STORE.weeklyBoards, STORE.templates] as const

/**
 * Creates or edits the CURRENT week's board atomically.
 *
 * The persistence layer is the last line of defence for a finalized board: the
 * stored board is read inside the same read-write transaction that would
 * rewrite it, and a `finalized` one is refused (`board_finalized`) whatever the
 * caller believes. The new record is built by the domain from the STORED board
 * (so a caller cannot smuggle in a status or a finalization), re-validated on
 * the way in, and written with a revision check, so a stale screen or a second
 * tab cannot overwrite newer changes.
 */
export async function saveWeeklyBoardAtomically(
  database: PersistenceDatabase,
  input: SaveWeeklyBoardInput,
): Promise<SaveWeeklyBoardResult> {
  try {
    return await runTransaction(database, SAVE_STORES, 'readwrite', (transaction) => attemptSave(transaction, input))
  } catch (error) {
    // A racing tab created the same week's board between our read and our add.
    if (error instanceof PersistenceError && error.code === 'constraint_violation' && input.expectedRevision === null) {
      return { status: 'rejected', reason: { code: 'board_exists' } }
    }
    throw error
  }
}

async function attemptSave(transaction: IDBTransaction, input: SaveWeeklyBoardInput): Promise<SaveWeeklyBoardResult> {
  const { weekKey, definition, expectedRevision, today, now } = input
  const boards = transaction.objectStore(STORE.weeklyBoards)
  const rejected = (reason: SaveWeeklyBoardRejection): SaveWeeklyBoardResult => ({ status: 'rejected', reason })

  const rawExisting = await requestToPromise(boards.get(weekKey))
  const existing =
    rawExisting === undefined ? null : parseStored(parseWeeklyBoard, rawExisting, `weekly board "${weekKey}"`)

  if (expectedRevision === null) {
    if (existing !== null) return rejected({ code: 'board_exists' })
  } else {
    if (existing === null) return rejected({ code: 'board_not_found' })
    if (existing.status !== 'active') return rejected({ code: 'board_finalized' })
    if (existing.revision !== expectedRevision) {
      return rejected({ code: 'stale_revision', expected: expectedRevision, actual: existing.revision })
    }
  }

  const endDate = weekEndOf(weekKey)
  if (compareDateKeys(endDate, today) < 0) return rejected({ code: 'week_over', endDate, today })
  if (compareDateKeys(weekKey, today) > 0) return rejected({ code: 'week_not_started', startDate: weekKey, today })

  const built =
    existing === null ? buildNewWeeklyBoard(weekKey, definition, now) : editWeeklyBoard(existing, definition, now)
  if (!built.ok) {
    return rejected(built.error.code === 'invalid' ? { code: 'invalid', problems: built.error.problems } : { code: 'board_finalized' })
  }
  const board = parseForWrite(parseWeeklyBoard, built.value, 'weekly board')

  // A link is a reference to stored data; never save one that points at nothing.
  const templates = transaction.objectStore(STORE.templates)
  for (const goal of board.goals) {
    if (goal.tracking.mode !== 'linked_quest') continue
    const found = await requestToPromise(templates.getKey(goal.tracking.templateId))
    if (found === undefined) return rejected({ code: 'unknown_template', templateId: goal.tracking.templateId })
  }

  if (existing === null) await requestToPromise(boards.add(board))
  else await requestToPromise(boards.put(board))
  return { status: existing === null ? 'created' : 'updated', board }
}
