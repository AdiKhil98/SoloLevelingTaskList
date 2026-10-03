import {
  finalizeWeeklyBoard,
  compareDateKeys,
  nextDate,
  type DateKey,
  type EpochMs,
  type FinalizeWeeklyBoardRejection,
  type WeekKey,
  type WeeklyFinalizationOutcome,
  type WeeklyGoalBoard,
} from '@/domain'
import { STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { PersistenceError } from '../errors'
import { readLedgerState } from '../ledger/ledgerTip'
import { parseWeeklyBoard } from '../records/weeklyBoard'
import { parseXpTransaction } from '../records/xpTransaction'
import { readEarliestOccurrenceDate, readLatestSummary } from '../repositories/dailySummaries'
import { parseForWrite, parseStored } from '../repositories/stored'
import { readCompletionCounts } from '../repositories/weeklyBoards'

export interface FinalizeWeekInput {
  readonly weekKey: WeekKey
  /** The caller's local date; a week that is not over is never finalized. */
  readonly today: DateKey
  /** The real instant of finalization (the bonus row's `createdAt`). Supplied by the caller; never read here. */
  readonly finalizedAt: EpochMs
}

export type FinalizeWeekRejection =
  | FinalizeWeeklyBoardRejection
  /** The week has no board: there is nothing to finalize (and nothing is invented). */
  | { readonly code: 'board_not_found' }
  /** The week's last day is not finalized yet; the daily chain must pass the board's Sunday first. */
  | { readonly code: 'days_not_finalized'; readonly cursor: DateKey }

export type FinalizeWeekResult =
  | ({ readonly status: 'finalized' } & WeeklyFinalizationOutcome)
  /** A repeat: the stored board, nothing written, no EXP. */
  | { readonly status: 'already_finalized'; readonly board: WeeklyGoalBoard }
  | { readonly status: 'rejected'; readonly reason: FinalizeWeekRejection }

const FINALIZE_STORES = [
  STORE.weeklyBoards,
  STORE.xpTransactions,
  STORE.completions,
  STORE.dailySummaries,
  STORE.occurrences,
] as const

/**
 * Finalizes one week's board and pays its bonus, atomically and exactly once
 * (MASTER_SPEC §12.5, §12.7).
 *
 * ONE read-write transaction over boards, the ledger, completions (read) and the
 * daily chain (read):
 *  1. the stored board is read; a finalized one is returned untouched;
 *  2. linked progress is counted from the completions of the week, and the
 *     ledger tip is read from the transaction itself (never from the caller);
 *  3. the domain scores the board, freezes the exact progress it scored, and
 *     builds the single bonus row (`seq = tip + 1`, `createdAt` = the real
 *     instant, `effectiveDate` = the Sunday, `sourceWeekKey` = the Monday);
 *  4. the daily chain must already be past the Sunday;
 *  5. the frozen board and the bonus row are written TOGETHER, or neither is.
 *
 * Exactly-once rests on three independent things: the board's status (read in
 * the same transaction that flips it), the ledger's unique idempotency key
 * (`weekly_goal_crusher:{weekKey}`) and IndexedDB serializing overlapping
 * read-write transactions. A racing tab therefore resolves to `already_finalized`.
 */
export async function finalizeWeekAtomically(
  database: PersistenceDatabase,
  input: FinalizeWeekInput,
): Promise<FinalizeWeekResult> {
  try {
    return await runTransaction(database, FINALIZE_STORES, 'readwrite', (transaction) => attemptFinalize(transaction, input))
  } catch (error) {
    // A racing tab may have finalized the week between our read and our write.
    if (error instanceof PersistenceError && error.code === 'constraint_violation') {
      const stored = await runTransaction(database, [STORE.weeklyBoards], 'readonly', (transaction) =>
        requestToPromise(transaction.objectStore(STORE.weeklyBoards).get(input.weekKey)),
      )
      if (stored !== undefined) {
        const board = parseStored(parseWeeklyBoard, stored, `weekly board "${input.weekKey}"`)
        if (board.status === 'finalized') return { status: 'already_finalized', board }
      }
    }
    throw error
  }
}

async function attemptFinalize(transaction: IDBTransaction, input: FinalizeWeekInput): Promise<FinalizeWeekResult> {
  const { weekKey, today, finalizedAt } = input
  const boards = transaction.objectStore(STORE.weeklyBoards)

  const raw = await requestToPromise(boards.get(weekKey))
  if (raw === undefined) return { status: 'rejected', reason: { code: 'board_not_found' } }
  const board = parseStored(parseWeeklyBoard, raw, `weekly board "${weekKey}"`)
  if (board.status === 'finalized') return { status: 'already_finalized', board }

  const linkedCounts = await readCompletionCounts(transaction, board.startDate, board.endDate)
  const ledger = await readLedgerState(transaction)
  const result = finalizeWeeklyBoard({ board, linkedCounts, ledger, today, finalizedAt })
  if (result.status !== 'finalized') return result

  // The daily lifecycle owns every day of the week: its last day must be closed first.
  const latest = await readLatestSummary(transaction)
  const cursor = latest !== null ? nextDate(latest.dateKey) : await readEarliestOccurrenceDate(transaction)
  if (cursor !== null && compareDateKeys(cursor, board.endDate) <= 0) {
    return { status: 'rejected', reason: { code: 'days_not_finalized', cursor } }
  }

  const frozen = parseForWrite(parseWeeklyBoard, result.board, 'weekly board')
  await requestToPromise(boards.put(frozen))
  if (result.xpTransaction !== null) {
    const row = parseForWrite(parseXpTransaction, result.xpTransaction, 'weekly bonus transaction')
    await requestToPromise(transaction.objectStore(STORE.xpTransactions).add(row))
  }
  return { ...result, board: frozen }
}
