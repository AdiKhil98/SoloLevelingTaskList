import {
  compareDateKeys,
  nextDate,
  type DateKey,
  type LinkedCompletionCounts,
  type WeekKey,
  type WeeklyGoalBoard,
  type WeeklyRewardClaim,
} from '@/domain'
import { INDEX, STORE } from '../config'
import type { PersistenceDatabase } from '../database/connection'
import { requestToPromise, runTransaction } from '../database/transaction'
import { parseCompletion } from '../records/completion'
import { parseWeeklyBoard, parseWeeklyRewardClaim } from '../records/weeklyBoard'
import { parseStored } from './stored'

/**
 * Weekly boards are WRITTEN only by the commands in `commands/` (create, edit,
 * set progress, finalize), each of which refuses a finalized board inside its
 * own transaction; claims are written only by `claimWeeklyRewardAtomically`.
 * This module only reads, so the repository exposes no way to change a board.
 */

export async function getWeeklyBoard(database: PersistenceDatabase, weekKey: WeekKey): Promise<WeeklyGoalBoard | null> {
  const raw = await runTransaction(database, [STORE.weeklyBoards], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.weeklyBoards).get(weekKey)),
  )
  return raw === undefined ? null : parseStored(parseWeeklyBoard, raw, `weekly board "${weekKey}"`)
}

/** Every board, oldest week first. */
export async function listWeeklyBoards(database: PersistenceDatabase): Promise<readonly WeeklyGoalBoard[]> {
  const raw = await runTransaction(database, [STORE.weeklyBoards], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.weeklyBoards).getAll()),
  )
  return raw.map((value, index) => parseStored(parseWeeklyBoard, value, `weekly board [${index}]`))
}

/**
 * The still-active boards whose week is over (`endDate < today`), oldest first:
 * what reconciliation has to finalize. Chronological order keeps the ledger
 * order of the bonuses deterministic.
 */
export async function listDueWeeklyBoardKeys(database: PersistenceDatabase, today: DateKey): Promise<readonly WeekKey[]> {
  const raw = await runTransaction(database, [STORE.weeklyBoards], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.weeklyBoards).index(INDEX.weeklyBoards.status).getAll('active')),
  )
  return raw
    .map((value, index) => parseStored(parseWeeklyBoard, value, `weekly board [${index}]`))
    .filter((board) => compareDateKeys(board.endDate, today) < 0)
    .map((board) => board.weekKey)
    .sort()
}

export async function getWeeklyRewardClaim(database: PersistenceDatabase, weekKey: WeekKey): Promise<WeeklyRewardClaim | null> {
  const raw = await runTransaction(database, [STORE.weeklyRewardClaims], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.weeklyRewardClaims).get(weekKey)),
  )
  return raw === undefined ? null : parseStored(parseWeeklyRewardClaim, raw, `weekly reward claim "${weekKey}"`)
}

/** Every claim, oldest week first. */
export async function listWeeklyRewardClaims(database: PersistenceDatabase): Promise<readonly WeeklyRewardClaim[]> {
  const raw = await runTransaction(database, [STORE.weeklyRewardClaims], 'readonly', (transaction) =>
    requestToPromise(transaction.objectStore(STORE.weeklyRewardClaims).getAll()),
  )
  return raw.map((value, index) => parseStored(parseWeeklyRewardClaim, value, `weekly reward claim [${index}]`))
}

/**
 * @internal Completions per quest template whose date lies in `[start, end]`,
 * read inside an open transaction that includes `questCompletions`. This is the
 * derived progress of a linked goal: it only counts rows, never writes, and
 * repeating it can never change anything.
 */
export async function readCompletionCounts(
  transaction: IDBTransaction,
  start: DateKey,
  end: DateKey,
): Promise<LinkedCompletionCounts> {
  const byDate = transaction.objectStore(STORE.completions).index(INDEX.completions.dateKey)
  const counts = new Map<string, number>()
  // One equality lookup per day (a week has seven): no key-range global, and each
  // day's completions are a handful of rows.
  for (let date = start; compareDateKeys(date, end) <= 0; date = nextDate(date)) {
    const raw = await requestToPromise(byDate.getAll(date))
    raw.forEach((value, index) => {
      const completion = parseStored(parseCompletion, value, `quest completion [${date}][${index}]`)
      counts.set(completion.templateId, (counts.get(completion.templateId) ?? 0) + 1)
    })
  }
  return counts
}

/** Completions per quest template inside `[start, end]` (a week's linked-goal progress). */
export async function countCompletionsByTemplate(
  database: PersistenceDatabase,
  start: DateKey,
  end: DateKey,
): Promise<LinkedCompletionCounts> {
  return runTransaction(database, [STORE.completions], 'readonly', (transaction) => readCompletionCounts(transaction, start, end))
}
